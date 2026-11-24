// Tests for the username filter (supabase/functions/_shared/names.ts and profanity.ts).
// Run: node --no-warnings tests/names.test.mjs
const { checkDisplayName, publicName } = await import('../supabase/functions/_shared/names.ts');
const { isProfane } = await import('../supabase/functions/_shared/profanity.ts');

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
const blocked = names => {
  const missed = names.filter(name => !isProfane(name));
  if (missed.length) throw new Error(`not blocked: ${missed.join(', ')}`);
};
const allowed = names => {
  const wrong = names.filter(name => isProfane(name));
  if (wrong.length) throw new Error(`wrongly blocked: ${wrong.join(', ')}`);
};

// ---- Hate speech ----
test('Racial and ethnic slurs are blocked', () =>
  blocked(['nigger', 'NiggaPilot', 'Kike99', 'Wetback', 'Raghead', 'Towelhead', 'Beaner', 'Chink', 'Gook', 'Spic', 'Jigaboo', 'Coon', 'Paki', 'Jap']));

test('Slurs inside a camelCase name are blocked', () =>
  blocked(['DirtyJap', 'StupidPaki', 'BigCoon', 'TheGook']));

test('Homophobic and transphobic slurs are blocked', () =>
  blocked(['faggot', 'Fag', 'Dyke', 'Homo', 'Tranny', 'Shemale']));

test('Nazi and hate-group names are blocked', () =>
  blocked(['Nazi', 'Hitler', 'AdolfHitler', 'KKK', 'KKKMember', 'Gestapo', 'Heil']));

test('Hate phrases are blocked however they are split', () =>
  blocked(['SiegHeil', 'Sieg Heil', 'sieg_heil', 'HeilHitler', 'WhitePower', 'White-Power', 'white.pride',
    'KillJews', 'Kill_Jews', 'Kill The Jews', 'GasTheJews', 'KillGays', 'Death To Jews', 'Untermensch']));

test('Hate number codes and symbols are blocked', () =>
  blocked(['Pilot1488', '14 88', '14-88', 'Ace8814', 'Wolf卐', 'ϟϟ Pilot']));

test('Disguised spellings are blocked (numbers, symbols, spaces, repeats)', () =>
  blocked(['N1gg3r', 'n!gger', 'F4ggot', 'H1tler', 'Naz1', 'n i g g e r', 'niiiigger', 'Fuuuck', 'Sh1t']));

test('Accented look-alikes are blocked', () =>
  blocked(['Nìggér', 'Hîtler', 'Fäggot']));

test('Romanian hate words are blocked', () =>
  blocked(['Jidan', 'Bozgor', 'Tigan', 'Muist', 'Pizda']));

test('Russian and Ukrainian hate words and swearing are blocked', () =>
  blocked(['Жид', 'Хохол', 'Москаль', 'Кацап', 'Пидор', 'Хуй', 'Чурка']));

test('Chinese hate words and swearing are blocked', () =>
  blocked(['支那人', '黑鬼', '日本鬼子', '傻逼']));

test('Hate aimed at a group is blocked (hate or violence word + group, any order)', () =>
  blocked(['IHateJews', 'IHateBlacks', 'IHateGays', 'JewHater', 'GayHater', 'BlackHater', 'Hate_Muslims', 'MuslimsOut',
    'NoJewsAllowed', 'KillAllBlacks', 'Kill_Women', 'BombTheJews', 'AntiGay', 'NoGays', 'ihatejews', 'killblacks', 'jewsout']));

test('Holocaust, Nazi and white-supremacist terms are blocked', () =>
  blocked(['GasChamber', 'Auschwitz', 'HolocaustDenier', 'SixMillionLies', 'AryanPride', 'WhiteSupremacy', 'RaceTraitor',
    'ThirdReich', 'WaffenSS', 'SS_Pilot', 'HH88', 'Adolf88', 'Swastika']));

test('"Hate speech" is blocked, including disguised as HatesPeech99', () =>
  blocked(['HatesPeech99', 'HateSpeech99', 'hate_speech']));

test('New disguises are blocked (split slurs, l for i, 6 for g)', () =>
  blocked(['Nig_Ger', 'Nlgger', 'Fa66ot', 'Kyke', 'Heeb', 'Tard', 'Sh00tUpSchool']));

test('Violence, terrorism and self-harm words are blocked', () =>
  blocked(['SchoolShooter', 'Columbine', 'TerroristKid', 'BinLaden', 'Taliban', 'KillYourself', 'SuicideSquad', 'Groomer']));

test('Sexual and drug words are blocked', () =>
  blocked(['Milf69', 'Horny_Pilot', 'Cocaine', 'Meth', 'Heroin', 'OnlyFans', 'Hentai']));

test('Swear words inside capitalized names are still blocked', () =>
  blocked(['BigShit', 'MotherFucker', 'Fuuuck', 'f u c k', 'FUCK', 'Sh1t']));

// ---- Innocent names must still work ----
test('Real names are allowed on their own', () =>
  allowed(['Aryan', 'Reich', 'Lynch', 'Isis', 'Adolf', 'Jihad', 'Osama', 'Nazir', 'Nazim', 'Cockburn', 'Gaylord', 'Noah', 'Nora', 'Nigel']));

test('Game-style names with violent words but no group are allowed', () =>
  allowed(['Killer', 'Sniper', 'KillerQueen', 'Assassin', 'ShootingStar', 'DeathStar', 'BanHammer', 'GasGiant',
    'HangGlider', 'BurnNotice', 'DieHard', 'AntiHero', 'LadyKiller', 'Outlaw']));

test('Group words without an attack are allowed', () =>
  allowed(['ProudJew', 'MuslimPilot', 'GayGamer', 'TransAm', 'WomenInSTEM', 'Christian', 'Hindu', 'BlackPanther',
    'BlackOut', 'BlackWidow', 'WhiteKnight', 'WomanPilot', 'IndianaJones', 'RomaFan']));

test('Words that only look bad across a capital or digit are allowed', () =>
  allowed(['PushIt', 'MassHit', 'PeaCock', 'CockPit2', 'Agent55', 'Jess', 'Pass', 'Mule', 'Method', 'Methane',
    'Heroine', 'Clock', 'Flake', 'Snigger', 'Nigeria', 'Niger', 'UrbanLegend', 'Hello', 'Bill']));


test('Innocent words that contain a blocked word are allowed', () =>
  allowed(['Scunthorpe', 'Cockpit', 'Hancock', 'Therapist', 'Torpedo', 'Spicy', 'Cocktail', 'Peacock']));

test('Innocent words that contain a hate word are allowed', () =>
  allowed(['Raccoon', 'Tycoon', 'Cocoon', 'Japan', 'JapanFan', 'Pakistan', 'Homer', 'Homonym', 'Dykstra', 'Heilman']));

test('Word joins that only look like a phrase are allowed', () =>
  allowed(['SkillJewel', 'Skill Jewel', 'TraceWarrior', 'Jewel', 'JewishPilot']));

test('Normal pilot names are allowed', () =>
  allowed(['SkyAce', 'Maverick', 'Red Baron', 'Pilot_42', 'Andrei.P', 'Ioana88', 'Liam14', 'Жидкий', '小飞机', 'Lynch', 'Isis', 'Siegfried']));

// ---- checkDisplayName (renames on the website) ----
test('Rename: a hateful name is refused with NameNotAllowed', () => {
  const check = checkDisplayName('WhitePower');
  if (check.ok || check.code !== 'NameNotAllowed') throw new Error(JSON.stringify(check));
});

test('Rename: a hate code is refused with NameNotAllowed', () => {
  const check = checkDisplayName('Ace1488');
  if (check.ok || check.code !== 'NameNotAllowed') throw new Error(JSON.stringify(check));
});

test('Rename: a normal name is accepted', () => {
  const check = checkDisplayName('Red Baron');
  if (!check.ok || check.name !== 'Red Baron') throw new Error(JSON.stringify(check));
});

test('Rename: the existing rules still apply (length, characters, reserved, mixed alphabets)', () => {
  const codes = ['ab', 'x'.repeat(21), 'Bad$Name', 'Admin', 'Guest1a2b', 'Pаvel'].map(n => checkDisplayName(n).code);
  const expected = ['TooShort', 'TooLong', 'BadCharacters', 'Reserved', 'Reserved', 'MixedScripts'];
  if (JSON.stringify(codes) !== JSON.stringify(expected)) throw new Error(`got ${codes.join(', ')}`);
});

// ---- publicName (names set in the game, shown on the site) ----
test('publicName hides hateful names', () => {
  const shown = ['Nazi', 'KillJews', 'Pilot1488', 'Wolf卐'].map(publicName);
  if (shown.some(name => name !== null)) throw new Error(`shown: ${shown.join(', ')}`);
});

test('publicName keeps normal names, even ones that break newer rename rules', () => {
  const names = ['SkyAce', 'A very long old game name 123', 'x!'];
  const shown = names.map(publicName);
  if (JSON.stringify(shown) !== JSON.stringify(names)) throw new Error(`got ${shown.join(', ')}`);
});

test('publicName returns null for a missing name', () => {
  if (publicName(null) !== null || publicName('') !== null || publicName(undefined) !== null) throw new Error('not null');
});

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} name filter tests passed`);
process.exitCode = passed === results.length ? 0 : 1;
