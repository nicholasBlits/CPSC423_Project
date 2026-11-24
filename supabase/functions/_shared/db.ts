// Minimal PostgREST client for the functions' own tables. Uses the service
// role key Supabase injects into every Edge Function; the tables have RLS on
// with no policies, so browsers holding the public anon key cannot read them.
import { ApiError, env } from './core.ts';

type Options = { body?: unknown; prefer?: string };

// deno-lint-ignore no-explicit-any
export async function db(method: string, path: string, { body, prefer }: Options = {}): Promise<any[]> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const url = `${env('SUPABASE_URL')}/rest/v1/${path}`;
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(502, 'DatabaseUnavailable', 'Could not reach the database');
  }
  if (!response.ok) {
    console.error('[db]', method, path.split('?')[0], response.status, await response.text().catch(() => ''));
    throw new ApiError(502, 'DatabaseError', 'Database request failed');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

export const q = encodeURIComponent;
export const now = () => new Date().toISOString();
