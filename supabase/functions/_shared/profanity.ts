// Display-name filter: hate speech, slurs, extremism, sexual words, drugs,
// self-harm and swearing. Names are folded first (case, accents, look-alike
// digits and symbols, long letter runs), so "F*CK", "5h1t", "Nlgger" and
// "fuuuuck" are caught, while innocent words ("cockpit", "Scunthorpe") are cut
// out before matching. Real people's names (Aryan, Lynch, Isis, Adolf, Jihad,
// Nazir, Reich) are left alone on their own; only hateful uses of them are
// blocked. Add to the lists as reports come in, with a test for each word.

// Blocked anywhere inside a word.
const ANYWHERE = [
  'fuck', 'fuk', 'fck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'dildo', 'porn',
  'rapist', 'retard', 'wank', 'twat', 'pussy', 'penis', 'vagina', 'cock', 'nazi', 'hitler', 'jizz', 'asshole',
  'bastard', 'motherf', 'blowjob', 'handjob', 'kike', 'kyke', 'tranny', 'pedo', 'paedo', 'molest',
  // Hate: slurs, hate groups, Nazism, the Holocaust, terrorism
  'kkk', 'raghead', 'towelhead', 'wetback', 'beaner', 'jigaboo', 'zipperhead', 'chingchong', 'darkie', 'nignog',
  'shemale', 'holohoax', 'gestapo', 'jihadi', 'auschwitz', 'swastika', 'gaschamber', 'binladen', 'alqaeda', 'taliban',
  'terrorist', 'columbine', 'groomer',
  // Sexual, drugs, self-harm
  'hentai', 'onlyfans', 'pornhub', 'xvideos', 'orgasm', 'incest', 'masturbat', 'ejaculat', 'cocaine', 'suicid',
  // Romanian
  'pizda', 'muist', 'cacat', 'futut', 'labagiu', 'bulangiu', 'tigan', 'jidan', 'bozgor',
  // Russian / Ukrainian
  'хуй', 'пизд', 'бляд', 'ебат', 'ебан', 'пидор', 'пидар', 'хохол', 'москал', 'кацап', 'чурк',
  // Chinese
  '傻逼', '操你', '他妈的', '草泥马', '婊子', '支那', '黑鬼', '鬼子', '尼哥'
];

// Also caught when split across words or symbols ("Nig_Ger", "Ausch Witz").
// Only words that cannot appear by accident when two innocent words meet.
const ANYWHERE_JOINED = [
  'nigger', 'nigga', 'faggot', 'kike', 'kyke', 'hitler', 'tranny', 'wetback', 'raghead', 'towelhead', 'jigaboo',
  'zipperhead', 'chingchong', 'nignog', 'holohoax', 'auschwitz', 'swastika', 'gaschamber', 'untermensch', 'binladen'
];

// Blocked only as a whole word (they hide inside innocent words).
const WHOLE_WORD = [
  'ass', 'arse', 'fag', 'fags', 'tit', 'tits', 'cum', 'dick', 'dicks', 'sex', 'anal', 'rape', 'kys', 'kms', 'wtf', 'stfu',
  'spic', 'spics', 'chink', 'chinks',
  // Hate words that hide inside innocent words ("raccoon", "Japan", "Pakistan", "homonym")
  'coon', 'coons', 'gook', 'gooks', 'jap', 'japs', 'paki', 'pakis', 'homo', 'homos', 'dyke', 'dykes', 'heil',
  'heeb', 'heebs', 'tard', 'tards', 'incel', 'incels',
  // Sexual and drugs ("method", "heroine", "boobook" stay fine)
  'milf', 'boob', 'boobs', 'boobies', 'nude', 'nudes', 'naked', 'horny', 'xxx', 'sperm', 'semen', 'boner', 'porno',
  'bdsm', 'fetish', 'clit', 'thot', 'hoe', 'hoes', 'meth', 'heroin', 'erection',
  'pula', 'fut', 'futu', 'muie', 'curva', 'coaie',
  'жид', 'жиды', 'хач', 'хачи'
];

// Phrases made of whole words, so "Kill_Jews", "KillJews" and "sieg heil" are
// caught but "SkillJewel" (s-killjew-el) is not. A phrase matches only when
// it lines up with whole words, split on spaces, symbols and capital letters.
const PHRASES = [
  'siegheil', 'heilhitler', 'whitepower', 'whitepride', 'whitegenocide', 'whitesupremacy', 'whitesupremacist',
  'aryanpride', 'aryanpower', 'aryannation', 'aryannations', 'aryanbrotherhood', 'aryanrace', 'racetraitor',
  'thirdreich', 'fourthreich', 'waffenss', 'hailvictory', 'fourteenwords', 'nonwhites', 'subhuman', 'untermensch',
  'mudrace', 'holocaustdenier', 'holocaustdenial', 'holocaustlie', 'holocausthoax', 'holocaustwasfake',
  'sixmillionlies', 'hatespeech', 'deathtoisrael', 'deathtoamerica', 'alqaeda', 'binladen', 'onlyfans', 'pornhub', 'xvideos',
  // Violence and self-harm
  'schoolshooter', 'schoolshooting', 'shootupschool', 'shootupaschool', 'massshooter', 'massshooting',
  'killyourself', 'killurself', 'killyoself', 'neckyourself', 'hangyourself', 'gokillyourself', 'cutmyself', 'selfharm'
];

// Hate or violence words that make a name hateful when it also names a group:
// "IHateJews", "Kill_Women", "MuslimsOut", "NoJewsAllowed", "AntiGay".
const ATTACK = [
  'hate', 'hates', 'hater', 'haters', 'hating', 'hatred', 'kill', 'kills', 'killer', 'killers', 'killing', 'murder',
  'murderer', 'gas', 'gassing', 'bomb', 'bombs', 'bomber', 'bombing', 'burn', 'burning', 'hang', 'hanging', 'lynch',
  'lynching', 'shoot', 'shooter', 'shooting', 'rape', 'raper', 'raping', 'exterminate', 'exterminator', 'eradicate',
  'genocide', 'slaughter', 'enslave', 'nuke', 'deport', 'ban', 'fuck', 'die', 'death', 'anti', 'no', 'out'
];
const GROUPS = [
  'jew', 'jews', 'jewish', 'jewry', 'gay', 'gays', 'lesbian', 'lesbians', 'homosexual', 'homosexuals', 'queer', 'queers',
  'trans', 'transgender', 'muslim', 'muslims', 'islam', 'arab', 'arabs', 'blacks', 'blackpeople', 'whites',
  'whitepeople', 'women', 'asian', 'asians', 'chinese', 'mexican', 'mexicans', 'latino', 'latinos', 'latina', 'latinas',
  'hispanic', 'hispanics', 'immigrant', 'immigrants', 'migrant', 'migrants', 'refugee', 'refugees', 'african',
  'africans', 'indian', 'indians', 'hindu', 'hindus', 'sikh', 'sikhs', 'christian', 'christians', 'catholic',
  'catholics', 'gypsy', 'gypsies', 'roma', 'romanians', 'hungarians', 'ukrainians', 'russians', 'disabled', 'evrei',
  'tigani'
];
// Words that are only hateful with "hate": "BlackHater" but not "BlackKiller" or "WomanKiller".
const HATE_ONLY = ['hate', 'hates', 'hater', 'haters', 'hating', 'hatred'];
const HATE_ONLY_GROUPS = ['black', 'white', 'woman'];

// Hate codes and symbols checked on the name as typed (digits kept).
const CODES = [
  /1488/, /8814/, /14\W*88/, /卐/, /ϟϟ/, /ᛋᛋ/,
  /(adolf|aryan|heil|hitler|reich|hh)\W*88/, /88\W*(adolf|aryan|heil|hitler|reich)/,
  /(^|[^\p{L}])ss([^\p{L}]|$)/u // "SS_Pilot", "SS Pilot"; not "Jess" or "Pass"
];

// Innocent words containing an ANYWHERE entry; removed before matching.
const ALLOWED = [
  'cockpit', 'cockpits', 'peacock', 'hancock', 'hitchcock', 'babcock', 'woodcock', 'gamecock', 'cocktail', 'cockatoo',
  'cockerel', 'cockroach', 'cockney', 'cockle', 'shuttlecock', 'cockburn', 'swank', 'swanky',
  'scunthorpe', 'therapist', 'shiitake', 'shitake', 'penistone', 'spice', 'spicy', 'hispanic', 'conspicuous',
  'pedometer', 'pedal', 'pedestrian', 'torpedo', 'encyclopedia', 'speedo', 'retardant', 'cacatua', 'snigger',
  'sniggers', 'nazir', 'nazira', 'nazim'
];

const LOOKALIKES: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '6': 'g', '7': 't',
  '8': 'b', '9': 'g', '+': 't', '€': 'e'
};

// Lowercase, strip accents (ă → a), keep CJK as-is.
function base(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

// Every way to read the name: "1" as i or l, "v" as v or u, "*" as any vowel.
// Loose readings also take "l" as "i" ("Nlgger"); whole-word checks skip
// them, since "mule" would read as "muie".
function readings(text: string, loose = false): string[] {
  const plain = base(text);
  const variants = new Set<string>();
  for (const one of ['i', 'l']) {
    for (const vee of ['u', 'v']) {
      for (const star of ['a', 'e', 'i', 'o', 'u']) {
        const pick: Record<string, string> = { '1': one, 'v': vee, '*': star };
        if (loose) pick.l = 'i';
        variants.add([...plain].map(c => pick[c] ?? LOOKALIKES[c] ?? c).join(''));
      }
    }
  }
  return [...variants];
}

const tokensOf = (reading: string) => reading.split(/[^\p{L}]+/u).filter(Boolean);

// Words in one reading, plus runs of single letters joined ("f u c k").
function words(reading: string): string[] {
  const tokens = tokensOf(reading);
  const out = [...tokens];
  let run = '';
  for (const token of [...tokens, '']) {
    if ([...token].length === 1) run += token;
    else { if (run.length > 1) out.push(run); run = ''; }
  }
  return out;
}

const squash = (word: string) => word.replace(/(\p{L})\1{2,}/gu, '$1'); // "fuuuck" → "fuck"
const BLOCK_ANY = ANYWHERE.map(base);
const BLOCK_JOINED = ANYWHERE_JOINED.map(base);
const BLOCK_WORD = new Set(WHOLE_WORD.map(base));
const BLOCK_PHRASE = new Set(PHRASES.map(base));
const ATTACKS = new Set(ATTACK);
const TARGETS = new Set(GROUPS);
const HATE = new Set(HATE_ONLY);
const HATE_TARGETS = new Set(HATE_ONLY_GROUPS);
// Also as loose readings see them ("cocktail" read as "cocktaii").
const ALLOW = [...new Set(ALLOWED.map(base).flatMap(word => [word, word.replace(/l/g, 'i')]))]
  .sort((a, b) => b.length - a.length);

const withoutAllowed = (word: string) => {
  let rest = word;
  for (const ok of ALLOW) rest = rest.split(ok).join(' ');
  return rest;
};

// True if some run of whole words in this reading spells a listed phrase.
function hasPhrase(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    let joined = '';
    for (let j = i; j < tokens.length && joined.length < 40; j++) {
      joined += tokens[j];
      if (BLOCK_PHRASE.has(joined)) return true;
    }
  }
  return false;
}

// True if the words pair an attack with a group. "no" and "anti" must come
// before the group ("NoJews"), "out" after it ("JewsOut").
function targetsGroup(tokens: string[]): boolean {
  const isGroup = (t: string) => TARGETS.has(t);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'no' || t === 'anti') {
      if (tokens.slice(i + 1).some(isGroup)) return true;
    } else if (t === 'out') {
      if (tokens.slice(0, i).some(isGroup)) return true;
    } else if (ATTACKS.has(t) && tokens.some(isGroup)) {
      return true;
    }
    if (HATE.has(t) && tokens.some(other => HATE_TARGETS.has(other))) return true;
  }
  // Run together in one word: "ihatejews", "killblacks", "jewsout".
  for (const token of tokens) {
    for (const group of TARGETS) {
      if (group.length < 4 || !token.includes(group)) continue;
      for (const attack of ATTACKS) {
        if (attack.length < 3 || attack === 'out') continue;
        if (token.includes(attack + group) || token.includes(group + attack)) return true;
      }
      if (token.includes(group + 'out')) return true;
    }
  }
  return false;
}

// Where a name's words meet by capitals: "PushIt" → [4], "IHateJews" → [1, 5].
function capitalBreaks(name: string): Set<number> {
  const plain = name.normalize('NFKD').replace(/\p{M}/gu, '');
  const breaks = new Set<number>();
  for (const m of plain.matchAll(/\p{Ll}(?=\p{Lu})/gu)) breaks.add(m.index! + 1);
  for (const m of plain.matchAll(/\p{Lu}(?=\p{Lu}\p{Ll})/gu)) breaks.add(m.index! + 1);
  return breaks;
}
const splitAtCapitals = (name: string) => name.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');

// True if a blocked word sits inside the reading without spanning two
// capitalized words ("BigShit" yes, "PushIt" no). Allowed words are blanked
// out first, keeping positions.
function hasBlockedPart(reading: string, breaks: Set<number>): boolean {
  let masked = reading;
  for (const ok of ALLOW) masked = masked.split(ok).join(' '.repeat(ok.length));
  for (const bad of BLOCK_ANY) {
    for (let at = masked.indexOf(bad); at !== -1; at = masked.indexOf(bad, at + 1)) {
      let spans = false;
      for (const b of breaks) if (b > at && b < at + bad.length) spans = true;
      if (!spans) return true;
    }
  }
  return false;
}

function check(name: string): boolean {
  const spaced = splitAtCapitals(name); // "IHateJews" → "I Hate Jews"
  const breaks = capitalBreaks(name);

  // Phrases and attacks on groups, word by word.
  for (const reading of new Set([...readings(spaced), ...readings(spaced, true)])) {
    const tokens = tokensOf(reading).map(squash);
    if (hasPhrase(tokens) || targetsGroup(tokens)) return true;
  }

  // Strong slurs split across words or symbols ("Nig_Ger").
  for (const reading of new Set([...readings(name), ...readings(name, true)])) {
    const joined = withoutAllowed(squash(tokensOf(reading).join('')));
    if (BLOCK_JOINED.some(bad => joined.includes(bad))) return true;
  }

  // Blocked parts of words, as typed.
  for (const reading of new Set([...readings(name), ...readings(name, true)])) {
    if (hasBlockedPart(reading, breaks)) return true;
  }

  // Whole words (strict readings only, since "mule" would read as "muie"),
  // stretched letters ("Fuuuck") and spaced-out letters ("f u c k").
  const strict = new Set([...readings(name), ...readings(spaced)]);
  for (const reading of new Set([...strict, ...readings(spaced, true)])) {
    for (const raw of words(reading)) {
      for (const word of new Set([raw, squash(raw)])) {
        if (strict.has(reading) && BLOCK_WORD.has(word)) return true;
        if (word !== raw || !tokensOf(reading).includes(raw)) {
          const rest = withoutAllowed(word);
          if (BLOCK_ANY.some(bad => rest.includes(bad))) return true;
        }
      }
    }
  }
  return false;
}

export function isProfane(name: string): boolean {
  if (CODES.some(code => code.test(base(name)))) return true;
  // Also with digits taken out, so "HateSpeech99" and "Milf69" are read as words
  // (digits otherwise stand for letters: "Sh1t", "Ni99er").
  return check(name) || check(name.replace(/\p{N}+/gu, ' '));
}
