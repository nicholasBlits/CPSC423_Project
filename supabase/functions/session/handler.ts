// GET/POST /session: confirms a PlayFab session ticket server-side and
// returns who it belongs to, including the stable playerId. Clients use it to
// check a saved session is still good, so it always asks PlayFab fresh.
import { json, withPlayer } from '../_shared/http.ts';
import { publicName } from '../_shared/names.ts';

export const handler = withPlayer(['GET', 'POST'], (req, player) => json(req, 200, { player: { ...player, displayName: publicName(player.displayName) } }), { fresh: true });
