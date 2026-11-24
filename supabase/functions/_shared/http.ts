// Shared HTTP plumbing for the site's API: CORS, JSON replies, and the
// session-ticket gate every player-facing function goes through.
import { ApiError, sha256 } from './core.ts';
import { verifySessionTicket } from './playfab.ts';
import { ensurePlayer, type KnownPlayer } from './players.ts';

export const TICKET_HEADER = 'X-Session-Ticket';

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function cors(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${TICKET_HEADER}`,
    'Access-Control-Max-Age': '600'
  };
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Reads a JSON object body; anything else is a 400.
// deno-lint-ignore no-explicit-any
export async function readBody(req: Request): Promise<Record<string, any>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'BadRequest', 'Expected a JSON object');
  return body;
}

// Hashed client IP, for rate limits without storing addresses.
export function clientIpHash(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  return sha256(`ip:${ip}`);
}

type Handler<T> = (req: Request, ctx: T) => Promise<Response> | Response;

// Wraps a handler for public endpoints: CORS, method check, error replies.
export function route(methods: string[], handler: Handler<null>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (!methods.includes(req.method)) return json(req, 405, { error: 'MethodNotAllowed' });
    try {
      return await handler(req, null);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status >= 500) console.error('[api]', error.code, error.message);
        return json(req, error.status, { error: error.code, message: error.message });
      }
      console.error('[api] unexpected', error);
      return json(req, 500, { error: 'ServerError', message: 'Something went wrong' });
    }
  };
}

// Like route, but only runs for a request carrying a valid PlayFab session
// ticket (sent by the website and by Unity in X-Session-Ticket). The handler
// gets the verified player, including their stable playerId.
// fresh: always ask PlayFab instead of using the short per-ticket cache.
export function withPlayer(methods: string[], handler: Handler<KnownPlayer>, { fresh = false } = {}) {
  return route(methods, async req => {
    const player = await verifySessionTicket(req.headers.get(TICKET_HEADER), fresh);
    return handler(req, await ensurePlayer(player));
  });
}
