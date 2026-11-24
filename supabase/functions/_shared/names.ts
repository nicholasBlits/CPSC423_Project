// Display-name rules, checked on the server for every rename. The website
// checks length and characters as you type; everything else lives here.
import { isProfane } from './profanity.ts';

export const NAME_MIN = 3;
export const NAME_MAX = 20;

export type NameCheck = { ok: true; name: string } | { ok: false; code: string; message: string };

const fail = (code: string, message: string): NameCheck => ({ ok: false, code, message });

// Names only staff or the site itself may use.
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'staff', 'support', 'official', 'system',
  'dtg', 'ducttape', 'ducttapegames', 'playfab', 'null', 'undefined'];
const RESERVED_INSIDE = ['admin', 'moderator', 'ducttape'];

function scripts(name: string): Set<string> {
  const found = new Set<string>();
  for (const ch of name) {
    if (/\p{Script=Latin}/u.test(ch)) found.add('Latin');
    else if (/\p{Script=Cyrillic}/u.test(ch)) found.add('Cyrillic');
    else if (/\p{Script=Greek}/u.test(ch)) found.add('Greek');
  }
  return found;
}

export function checkDisplayName(input: unknown): NameCheck {
  if (typeof input !== 'string') return fail('BadName', 'Enter a name.');
  const name = input.normalize('NFKC').trim();
  const length = [...name].length;
  if (length < NAME_MIN) return fail('TooShort', `Names need at least ${NAME_MIN} characters.`);
  if (length > NAME_MAX) return fail('TooLong', `Names can be up to ${NAME_MAX} characters.`);
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N}]|[ _.-](?=[\p{L}\p{N}]))*$/u.test(name)) {
    return fail('BadCharacters', 'Use letters and numbers, with single spaces, dots, dashes or underscores between them.');
  }
  // Mixing look-alike alphabets (a Cyrillic "а" in a Latin name) is how people impersonate others.
  if (scripts(name).size > 1) return fail('MixedScripts', 'Use one alphabet for your name.');

  const folded = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (RESERVED.includes(folded) || RESERVED_INSIDE.some(word => folded.includes(word))) {
    return fail('Reserved', 'That name is reserved. Try another.');
  }
  // Automatic names the site gives guests and new players.
  if (/^(guest|pilot)[0-9a-f]{0,8}$/.test(folded)) return fail('Reserved', 'That name is reserved. Try another.');
  if (isProfane(name)) return fail('NameNotAllowed', 'That name is not allowed. Try another.');
  return { ok: true, name };
}

// The name to show for a player, or null when it is hateful or profane.
// Names can also be set in the game, which skips checkDisplayName, so every
// name the server hands out (to the site, the game or an email) goes through
// this. Older names that only break the length or character rules still show.
export function publicName(name: string | null | undefined): string | null {
  if (!name) return null;
  return isProfane(name.normalize('NFKC')) ? null : name;
}
