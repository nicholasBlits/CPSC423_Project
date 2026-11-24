// GET /profile: the signed-in player's profile for the website.
// POST /profile with one of:
//   { confirmAge: true }          records the player's 18+ confirmation
//   { displayName: "New Name" }   renames (needs 18+, at most once an hour)
//   { signOutAllBrowsers: true }  revokes every browser linked by game code
import { ApiError } from '../_shared/core.ts';
import { db, now, q } from '../_shared/db.ts';
import { json, readBody, withPlayer } from '../_shared/http.ts';
import { checkDisplayName, publicName } from '../_shared/names.ts';
import { playfabServer } from '../_shared/playfab.ts';
import type { KnownPlayer } from '../_shared/players.ts';

export const AGE_POLICY_VERSION = '2026-10';
const RENAME_COOLDOWN_MS = 3600e3;

async function playerRow(playerId: string) {
  const [row] = await db('GET', `players?id=eq.${q(playerId)}&select=created_at,age_confirmed_at,display_name_changed_at`);
  return row ?? {};
}

async function elo(playFabId: string): Promise<number | null> {
  const name = Deno.env.get('PLAYFAB_ELO_STATISTIC') ?? 'Elo';
  try {
    const data = await playfabServer('GetPlayerStatistics', { PlayFabId: playFabId, StatisticNames: [name] });
    // deno-lint-ignore no-explicit-any
    return data.Statistics?.find((s: any) => s.StatisticName === name)?.Value ?? null;
  } catch {
    return null; // the profile still loads without it
  }
}

async function profile(player: KnownPlayer) {
  const [row, rating, browsers] = await Promise.all([
    playerRow(player.playerId),
    elo(player.playFabId),
    db('GET', `web_devices?player_id=eq.${q(player.playerId)}&revoked_at=is.null&expires_at=gt.${q(now())}&select=id`)
  ]);
  const nextRename = row.display_name_changed_at ? Date.parse(row.display_name_changed_at) + RENAME_COOLDOWN_MS : 0;
  const nameCheck = player.displayName ? checkDisplayName(player.displayName) : null;
  return {
    playerId: player.playerId,
    playFabId: player.playFabId,
    displayName: publicName(player.displayName), // hidden when hateful; displayNameIssue says why
    // Names from before these rules (set in the game) are kept, but flagged.
    displayNameIssue: nameCheck && !nameCheck.ok ? nameCheck.message : null,
    providers: player.providers,
    created: player.created ?? row.created_at ?? null,
    elo: rating,
    ageConfirmed: Boolean(row.age_confirmed_at),
    renameAvailableAt: nextRename > Date.now() ? new Date(nextRename).toISOString() : null,
    linkedBrowsers: browsers.length
  };
}

async function rename(player: KnownPlayer, input: unknown) {
  const row = await playerRow(player.playerId);
  if (!row.age_confirmed_at) throw new ApiError(403, 'AgeConfirmationRequired', 'Confirm you are 18 or older before choosing a name.');
  const check = checkDisplayName(input);
  if (!check.ok) throw new ApiError(400, check.code, check.message);
  if (check.name === player.displayName) return;
  if (row.display_name_changed_at && Date.parse(row.display_name_changed_at) + RENAME_COOLDOWN_MS > Date.now()) {
    throw new ApiError(429, 'RenameTooSoon', 'You changed your name recently. Try again in an hour.');
  }
  await playfabServer('UpdateUserTitleDisplayName', { PlayFabId: player.playFabId, DisplayName: check.name }, 'Admin');
  await db('PATCH', `players?id=eq.${q(player.playerId)}`, { body: { display_name: check.name, display_name_changed_at: now() } });
  player.displayName = check.name;
}

export const handler = withPlayer(['GET', 'POST'], async (req, player) => {
  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.confirmAge === true) {
      await db('PATCH', `players?id=eq.${q(player.playerId)}&age_confirmed_at=is.null`, {
        body: { age_confirmed_at: now(), age_policy_version: AGE_POLICY_VERSION }
      });
    } else if ('displayName' in body) {
      await rename(player, body.displayName);
    } else if (body.signOutAllBrowsers === true) {
      await db('PATCH', `web_devices?player_id=eq.${q(player.playerId)}&revoked_at=is.null`, { body: { revoked_at: now() } });
    } else {
      throw new ApiError(400, 'BadRequest', 'Nothing to change');
    }
  }
  return json(req, 200, { profile: await profile(player) });
}, { fresh: true });
