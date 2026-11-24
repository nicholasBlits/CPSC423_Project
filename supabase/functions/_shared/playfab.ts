// Server-side PlayFab calls. The secret key lives only in this function's
// environment; clients send a session ticket and never their own player ID.
import { ApiError, env, sha256 } from './core.ts';

export type Player = {
  playFabId: string;
  displayName: string | null;
  created: string | null;
  providers: string[];
};

// PlayFab errors that mean "this ticket is no good". Anything else (a bad
// secret key, PlayFab being down) is our problem, so clients must not drop
// their session over it.
const TICKET_ERRORS = new Set([
  'InvalidSessionTicket', 'ExpiredSessionTicket', 'SessionTicketExpired',
  'AccountNotFound', 'AccountDeleted', 'InvalidPlayFabId'
]);
const BANNED_ERRORS = new Set(['AccountBanned', 'IpAddressBanned']);
const CACHE_MS = 60_000;
const cache = new Map<string, { player: Player; until: number }>();

// deno-lint-ignore no-explicit-any
function providersOf(info: any): string[] {
  const providers: string[] = [];
  if (info.CustomIdInfo?.CustomId) providers.push('guest');
  if (info.OpenIdInfo?.length) {
    const google = Deno.env.get('PLAYFAB_GOOGLE_CONNECTION_ID') ?? 'google';
    for (const link of info.OpenIdInfo) providers.push(link.ConnectionId === google ? 'google' : `openid:${link.ConnectionId}`);
  }
  if (info.GooglePlayGamesInfo?.GooglePlayGamesPlayerId) providers.push('google_play_games');
  if (info.GoogleInfo?.GoogleId) providers.push('google_play');
  if (info.SteamInfo?.SteamId) providers.push('steam');
  if (info.AndroidDeviceInfo?.AndroidDeviceId) providers.push('android_device');
  if (info.IosDeviceInfo?.IosDeviceId) providers.push('ios_device');
  if (info.PrivateInfo?.Email || info.Username) providers.push('playfab');
  return providers;
}

// PlayFab errors a caller can act on, passed through as-is.
const CALLER_ERRORS: Record<string, [number, string, string]> = {
  NameNotAvailable: [409, 'NameTaken', 'That name is taken. Try another.'],
  ProfaneDisplayName: [400, 'NameNotAllowed', 'That name is not allowed. Try another.']
};

export async function playfabServer(path: string, body: unknown, api: 'Server' | 'Admin' = 'Server') {
  const url = `https://${env('PLAYFAB_TITLE_ID')}.playfabapi.com/${api}/${path}`;
  const secret = env('PLAYFAB_SECRET_KEY');
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SecretKey': secret },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError(502, 'PlayFabUnavailable', 'Could not reach PlayFab');
  }
  const json = await response.json().catch(() => ({}));
  if (json.code === 200) return json.data;
  console.error(`[playfab] ${path} failed`, response.status, json.error, json.errorMessage);
  if (BANNED_ERRORS.has(json.error)) throw new ApiError(403, 'Banned', 'This account cannot play right now');
  if (CALLER_ERRORS[json.error]) throw new ApiError(...CALLER_ERRORS[json.error]);
  if (TICKET_ERRORS.has(json.error)) throw new ApiError(401, json.error, 'Session is not valid');
  throw new ApiError(502, 'PlayFabError', 'PlayFab request failed');
}

// Returns the verified player behind a session ticket. Results are cached
// briefly per ticket (by hash, so tickets are never kept in memory as-is);
// pass fresh to skip the cache when linked providers or bans must be current.
export async function verifySessionTicket(ticket: string | null, fresh = false): Promise<Player> {
  if (!ticket || ticket.length > 1024) throw new ApiError(401, 'MissingTicket', 'Sign in first');
  const key = await sha256(ticket);
  const hit = cache.get(key);
  if (!fresh && hit && hit.until > Date.now()) return hit.player;

  const data = await playfabServer('AuthenticateSessionTicket', { SessionTicket: ticket });
  if (data.IsSessionTicketExpired) throw new ApiError(401, 'SessionTicketExpired', 'Session expired');
  const info = data.UserInfo ?? {};
  if (!info.PlayFabId) throw new ApiError(502, 'PlayFabError', 'Could not verify the session');
  if (info.TitleInfo?.isBanned) throw new ApiError(403, 'Banned', 'This account cannot play right now');

  const player: Player = {
    playFabId: info.PlayFabId,
    displayName: info.TitleInfo?.DisplayName ?? null,
    created: info.Created ?? null,
    providers: providersOf(info)
  };
  if (cache.size > 5000) cache.clear();
  cache.set(key, { player, until: Date.now() + CACHE_MS });
  return player;
}

export function clearTicketCache() {
  cache.clear();
}

// Starts a client session for an existing player from the server, for a
// browser that proved it may use the account (a link code or device token).
// Uses a Server Custom ID, which players cannot log in with themselves; it is
// attached the first time it is needed.
export async function loginAsPlayer(playFabId: string): Promise<{ ticket: string; displayName: string | null }> {
  const serverCustomId = `dtg-web:${playFabId}`;
  const login = () => playfabServer('LoginWithServerCustomId', {
    ServerCustomId: serverCustomId, CreateAccount: false, InfoRequestParameters: { GetPlayerProfile: true }
  });
  let data;
  try {
    data = await login();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code === 'Banned' || error.code === 'PlayFabUnavailable') throw error;
    await playfabServer('LinkServerCustomId', { PlayFabId: playFabId, ServerCustomId: serverCustomId, ForceLink: true });
    data = await login();
  }
  if (data.PlayFabId !== playFabId) throw new ApiError(502, 'PlayFabError', 'PlayFab returned a different player');
  return { ticket: data.SessionTicket, displayName: data.InfoResultPayload?.PlayerProfile?.DisplayName ?? null };
}
