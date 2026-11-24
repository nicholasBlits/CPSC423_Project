// The playerId layer: every PlayFab account gets one stable row in `players`,
// and community data refers to players.id, never to PlayFab IDs directly.
import { db, now, q } from './db.ts';
import type { Player } from './playfab.ts';

export type KnownPlayer = Player & { playerId: string };

const ids = new Map<string, string>(); // playFabId -> players.id (never changes)

export async function ensurePlayer(player: Player): Promise<KnownPlayer> {
  let playerId = ids.get(player.playFabId);
  if (!playerId) {
    const [row] = await db('POST', 'players?on_conflict=playfab_id&select=id', {
      body: { playfab_id: player.playFabId, display_name: player.displayName, last_seen_at: now() },
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    playerId = row.id as string;
    if (ids.size > 10000) ids.clear();
    ids.set(player.playFabId, playerId);
  }
  return { ...player, playerId };
}

export async function playFabIdOf(playerId: string): Promise<string | null> {
  const [row] = await db('GET', `players?id=eq.${q(playerId)}&select=playfab_id`);
  return row?.playfab_id ?? null;
}

export function forgetPlayerIds() {
  ids.clear();
}
