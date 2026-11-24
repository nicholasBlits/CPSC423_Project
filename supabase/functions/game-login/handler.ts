// POST /game-login: the secret id the WebGL game logs in with, for the
// signed-in player only (checked by session ticket). The game uses it as the
// account's PlayFab CustomID, so it works like a password and must be long and
// random. A guest already has one (a random UUID); any other account gets a
// new random one linked to it the first time. Returns { id, name }.
import { ApiError, env, randomToken } from '../_shared/core.ts';
import { json, TICKET_HEADER, withPlayer } from '../_shared/http.ts';
import { publicName } from '../_shared/names.ts';
import { playfabServer } from '../_shared/playfab.ts';

// What the game accepts: 32-100 letters, digits, '-' or '_'.
export const GAME_ID = /^[A-Za-z0-9_-]{32,100}$/;

async function customIdOf(playFabId: string): Promise<string | null> {
  const data = await playfabServer('GetUserAccountInfo', { PlayFabId: playFabId });
  return data.UserInfo?.CustomIdInfo?.CustomId ?? null;
}

// LinkCustomID is a Client API call, made as the player with their ticket.
// Returns PlayFab's error code, or null when it worked.
async function linkCustomId(ticket: string, customId: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://${env('PLAYFAB_TITLE_ID')}.playfabapi.com/Client/LinkCustomID`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Authorization': ticket },
      body: JSON.stringify({ CustomId: customId, ForceLink: false })
    });
  } catch {
    throw new ApiError(502, 'PlayFabUnavailable', 'Could not reach PlayFab');
  }
  const body = await response.json().catch(() => ({}));
  if (body.code === 200) return null;
  console.error('[game-login] LinkCustomID failed', response.status, body.error);
  return body.error ?? 'PlayFabError';
}

export const handler = withPlayer(['POST'], async (req, player) => {
  let id = await customIdOf(player.playFabId);
  if (!id) {
    const fresh = randomToken(20); // 40 hex characters from a crypto random generator
    // On failure, another tab may have linked one first: use whatever is there now.
    id = (await linkCustomId(req.headers.get(TICKET_HEADER)!, fresh)) ? await customIdOf(player.playFabId) : fresh;
    if (!id) throw new ApiError(502, 'PlayFabError', 'Could not set up the game login');
  }
  // An account can hold only one CustomID; a short one from elsewhere can't be replaced safely.
  if (!GAME_ID.test(id)) {
    console.error('[game-login] account has a CustomID the game would refuse', player.playFabId);
    throw new ApiError(409, 'GameIdUnavailable', 'This account cannot open the browser game yet. Contact support@ducttapegames.com.');
  }
  return json(req, 200, { id, name: publicName(player.displayName) });
}, { fresh: true });
