// POST /device-session { deviceToken }: renews the session of a browser that
// redeemed a link code (the token lasts 90 days from its last use).
// POST { deviceToken, signOut: true } forgets that browser for good.
import { ApiError } from '../_shared/core.ts';
import { db, now, q } from '../_shared/db.ts';
import { json, readBody, route } from '../_shared/http.ts';
import { DEVICE_TTL_MS, fromNow, hashDeviceToken } from '../_shared/linking.ts';
import { publicName } from '../_shared/names.ts';
import { loginAsPlayer } from '../_shared/playfab.ts';
import { playFabIdOf } from '../_shared/players.ts';

const UNLINKED = 'This browser is no longer linked to your game account. Get a new code in the game to link it again.';

export const handler = route(['POST'], async req => {
  const { deviceToken, signOut } = await readBody(req);
  if (typeof deviceToken !== 'string' || !/^[0-9a-f]{64}$/.test(deviceToken)) throw new ApiError(401, 'InvalidDevice', UNLINKED);
  const hash = await hashDeviceToken(deviceToken);

  if (signOut === true) {
    await db('PATCH', `web_devices?token_hash=eq.${hash}`, { body: { revoked_at: now() } });
    return json(req, 200, { ok: true });
  }

  const [device] = await db('PATCH', `web_devices?token_hash=eq.${hash}&revoked_at=is.null&expires_at=gt.${q(now())}&select=player_id`, {
    body: { last_used_at: now(), expires_at: fromNow(DEVICE_TTL_MS) }, prefer: 'return=representation'
  });
  const playFabId = device && await playFabIdOf(device.player_id);
  if (!playFabId) throw new ApiError(401, 'InvalidDevice', UNLINKED);
  const { ticket, displayName } = await loginAsPlayer(playFabId);
  return json(req, 200, { sessionTicket: ticket, playFabId, playerId: device.player_id, displayName: publicName(displayName) });
});
