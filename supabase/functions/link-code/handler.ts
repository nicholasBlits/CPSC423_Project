// POST /link-code: a signed-in game client asks for a one-time code that
// opens the same account on the website (link.html). Each new code replaces
// the player's previous unused one.
import { db, q } from '../_shared/db.ts';
import { json, withPlayer } from '../_shared/http.ts';
import { CODE_TTL_MS, formatCode, fromNow, hashCode, randomCode } from '../_shared/linking.ts';

export const handler = withPlayer(['POST'], async (req, player) => {
  const code = randomCode();
  const expiresAt = fromNow(CODE_TTL_MS);
  await db('DELETE', `link_codes?player_id=eq.${q(player.playerId)}&used_at=is.null`);
  await db('POST', 'link_codes', { body: { code_hash: await hashCode(code), player_id: player.playerId, expires_at: expiresAt } });
  return json(req, 200, { code: formatCode(code), expiresAt, expiresIn: CODE_TTL_MS / 1000 });
}, { fresh: true });
