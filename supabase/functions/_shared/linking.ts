// One-time link codes (shown in the game, typed on the website) and the
// long-lived browser tokens a redeemed code turns into.
import { sha256 } from './core.ts';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0 or 1
const CODE_LENGTH = 8;
export const CODE_TTL_MS = 10 * 60e3;
export const DEVICE_TTL_MS = 90 * 24 * 3600e3; // since the browser last used it

export function randomCode(): string {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // 248 is the largest multiple of 31 below 256, so every letter is equally likely.
      if (byte < 248 && code.length < CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

// Accepts "k7qm-3xpa", "K7QM 3XPA" and so on; null when it cannot be a code.
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && [...code].every(c => ALPHABET.includes(c)) ? code : null;
}

export const hashCode = (code: string) => sha256(`link:${code}`);
export const hashDeviceToken = (token: string) => sha256(`device:${token}`);
export const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();
