// POST /link-redeem { code }: the website trades a code from the game for a
// session on that same account, plus a token so this browser stays signed in.
// Public, so failed attempts are rate-limited per (hashed) IP.
import { ApiError, randomToken } from '../_shared/core.ts';
import { db, now, q } from '../_shared/db.ts';
import { clientIpHash, json, readBody, route } from '../_shared/http.ts';
import { DEVICE_TTL_MS, fromNow, hashCode, hashDeviceToken, normalizeCode } from '../_shared/linking.ts';
import { publicName } from '../_shared/names.ts';
import { loginAsPlayer } from '../_shared/playfab.ts';
import { playFabIdOf } from '../_shared/players.ts';

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60e3;

export const handler = route(['POST'], async req => {
  const ipHash = await clientIpHash(req);
  const recent = await db('GET', `link_attempts?ip_hash=eq.${ipHash}&at=gt.${q(fromNow(-WINDOW_MS))}&select=at&limit=${MAX_FAILURES}`);
  if (recent.length >= MAX_FAILURES) throw new ApiError(429, 'TooManyAttempts', 'Too many tries. Wait 15 minutes, then try again.');

  const code = normalizeCode((await readBody(req)).code);
  // A single conditional update, so two browsers cannot both use one code.
  const [claimed] = code
    ? await db('PATCH', `link_codes?code_hash=eq.${await hashCode(code)}&used_at=is.null&expires_at=gt.${q(now())}&select=player_id`, {
      body: { used_at: now() }, prefer: 'return=representation'
    })
    : [];
  if (!claimed) {
    await db('POST', 'link_attempts', { body: { ip_hash: ipHash } });
    await db('DELETE', `link_attempts?at=lt.${q(fromNow(-24 * 3600e3))}`);
    throw new ApiError(400, 'InvalidCode', 'That code is not valid or has expired. Get a new code in the game and try again.');
  }

  const playFabId = await playFabIdOf(claimed.player_id);
  if (!playFabId) throw new ApiError(400, 'InvalidCode', 'That code is not valid or has expired. Get a new code in the game and try again.');
  const { ticket, displayName } = await loginAsPlayer(playFabId);
  const deviceToken = randomToken();
  await db('POST', 'web_devices', {
    body: { player_id: claimed.player_id, token_hash: await hashDeviceToken(deviceToken), last_used_at: now(), expires_at: fromNow(DEVICE_TTL_MS) }
  });
  return json(req, 200, { sessionTicket: ticket, playFabId, playerId: claimed.player_id, displayName: publicName(displayName), deviceToken });
});
