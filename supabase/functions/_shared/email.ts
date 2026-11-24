// Hands a welcome email to n8n, which writes and sends it (n8n/welcome-email.workflow.json).
// Needs N8N_WELCOME_WEBHOOK_URL (the workflow's production webhook URL) and
// N8N_WEBHOOK_SECRET (the value of the workflow's X-DTG-Secret header auth).
// The workflow answers only after the email is sent, so a failure here means
// it was not sent.
import { ApiError, env } from './core.ts';

export type Welcome = { email: string; name: string };

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ESCAPES[c]);

export async function sendWelcome({ email, name }: Welcome): Promise<void> {
  let response: Response;
  try {
    response = await fetch(env('N8N_WELCOME_WEBHOOK_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DTG-Secret': env('N8N_WEBHOOK_SECRET') },
      // nameHtml is safe to drop into the HTML email as-is.
      body: JSON.stringify({ email, name, nameHtml: escapeHtml(name) })
    });
  } catch {
    throw new ApiError(502, 'EmailUnavailable', 'Could not reach the email service');
  }
  if (!response.ok) {
    console.error('[email] n8n webhook failed', response.status);
    throw new ApiError(502, 'EmailFailed', 'The email could not be sent');
  }
}
