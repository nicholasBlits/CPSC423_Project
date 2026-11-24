// POST /welcome-email { idToken }: sends the signed-in player a welcome email,
// once, right after they make an account with Google (a new Google sign-in, or
// a guest saving their progress with Google).
//
// The address comes only from a Google ID token that Google confirms is valid,
// was issued to this site, has a verified email, and belongs to the Google
// login linked to this player's PlayFab account. The address is handed to the
// n8n workflow that writes and sends the email, then dropped here; only the
// time of sending is stored.
import { ApiError, env } from '../_shared/core.ts';
import { db, now, q } from '../_shared/db.ts';
import { sendWelcome } from '../_shared/email.ts';
import { json, readBody, withPlayer } from '../_shared/http.ts';
import { publicName } from '../_shared/names.ts';
import { playfabServer } from '../_shared/playfab.ts';

type GoogleClaims = { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean };

// Google checks the signature and expiry. https://developers.google.com/identity/sign-in/web/backend-auth
// A bad Google token is a 400, never a 401: the site reads 401 as "your session
// ended" and signs the player out, and a welcome email must never do that.
async function verifyGoogleToken(idToken: unknown): Promise<{ sub: string; email: string }> {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 4096) throw new ApiError(400, 'BadRequest', 'Missing Google token');
  let response: Response;
  try {
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  } catch {
    throw new ApiError(502, 'GoogleUnavailable', 'Could not reach Google');
  }
  if (!response.ok) throw new ApiError(400, 'InvalidGoogleToken', 'Google did not accept the token');
  const claims: GoogleClaims = await response.json().catch(() => ({}));
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (claims.aud !== env('GOOGLE_CLIENT_ID') || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') || !claims.sub) {
    throw new ApiError(400, 'InvalidGoogleToken', 'The Google token is not for this site');
  }
  if (!claims.email || !verified) throw new ApiError(400, 'NoVerifiedEmail', 'Google did not share a verified email');
  return { sub: claims.sub, email: claims.email };
}

// The Google subjects linked to this PlayFab account through the site's OpenID connection.
async function linkedGoogleSubjects(playFabId: string): Promise<string[]> {
  const connection = Deno.env.get('PLAYFAB_GOOGLE_CONNECTION_ID') ?? 'google';
  const data = await playfabServer('GetUserAccountInfo', { PlayFabId: playFabId });
  // deno-lint-ignore no-explicit-any
  return (data.UserInfo?.OpenIdInfo ?? []).filter((link: any) => link.ConnectionId === connection).map((link: any) => link.Subject);
}

// Marks the email as sent; true only for the one request that set it.
async function claimWelcome(playerId: string): Promise<boolean> {
  const rows = await db('PATCH', `players?id=eq.${q(playerId)}&welcome_email_sent_at=is.null&select=id`, {
    body: { welcome_email_sent_at: now() },
    prefer: 'return=representation'
  });
  return rows.length === 1;
}

async function releaseWelcome(playerId: string) {
  await db('PATCH', `players?id=eq.${q(playerId)}`, { body: { welcome_email_sent_at: null } }).catch(() => {});
}

export const handler = withPlayer(['POST'], async (req, player) => {
  const { idToken } = await readBody(req);
  const google = await verifyGoogleToken(idToken);
  if (!(await linkedGoogleSubjects(player.playFabId)).includes(google.sub)) {
    throw new ApiError(403, 'GoogleNotLinked', 'That Google account is not linked to this player');
  }
  if (!(await claimWelcome(player.playerId))) return json(req, 200, { sent: false, reason: 'AlreadySent' });
  try {
    await sendWelcome({ email: google.email, name: publicName(player.displayName)?.trim() || 'pilot' });
  } catch (error) {
    await releaseWelcome(player.playerId); // let a later sign-in try again
    throw error;
  }
  return json(req, 200, { sent: true });
}, { fresh: true });
