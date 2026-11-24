// Tests for the game-login server function (supabase/functions/game-login).
// Runs the real handler in Node with PlayFab and the database faked.
// Run: node tests/game-login.test.mjs
const env = {
  PLAYFAB_TITLE_ID: 'E1BA8',
  PLAYFAB_SECRET_KEY: 'test-secret',
  SUPABASE_URL: 'https://db.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  ALLOWED_ORIGINS: 'https://www.ducttapegames.com'
};
globalThis.Deno = { env: { get: name => env[name] } };

// Fake PlayFab accounts, by session ticket.
let accounts;
let calls;
function reset() {
  accounts = {
    'guest-ticket': { PlayFabId: 'GUEST0001', CustomIdInfo: { CustomId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' } },
    'google-ticket': { PlayFabId: 'GOOGLE002', TitleInfo: { DisplayName: 'SkyAce' } },
    'short-ticket': { PlayFabId: 'SHORT0003', CustomIdInfo: { CustomId: 'abc123' } },
    'race-ticket': { PlayFabId: 'RACE00004', raceWith: 'r'.repeat(40) }
  };
  calls = [];
}
const byId = id => Object.values(accounts).find(a => a.PlayFabId === id);
const ok = data => new Response(JSON.stringify({ code: 200, data }), { status: 200 });
const fail = (status, error) => new Response(JSON.stringify({ code: status, error, errorMessage: error }), { status });

globalThis.fetch = async (url, init) => {
  const body = init.body ? JSON.parse(init.body) : null;
  const call = String(url).replace(/^https:\/\/[^/]+\//, '');
  calls.push({ call, body, headers: init.headers });
  if (call === 'Server/AuthenticateSessionTicket') {
    const account = accounts[body.SessionTicket];
    return account ? ok({ UserInfo: account, IsSessionTicketExpired: false }) : fail(400, 'InvalidSessionTicket');
  }
  if (call === 'Server/GetUserAccountInfo') return ok({ UserInfo: byId(body.PlayFabId) });
  if (call === 'Client/LinkCustomID') {
    const account = accounts[init.headers['X-Authorization']];
    if (account.raceWith) { // another tab linked first
      account.CustomIdInfo = { CustomId: account.raceWith };
      return fail(400, 'AccountAlreadyLinked');
    }
    if (account.CustomIdInfo) return fail(400, 'AccountAlreadyLinked');
    account.CustomIdInfo = { CustomId: body.CustomId };
    return ok({});
  }
  if (call.startsWith('rest/v1/players')) return new Response(JSON.stringify([{ id: `player-${body.playfab_id}` }]), { status: 201 });
  throw new Error(`unexpected request: ${url}`);
};

const { handler, GAME_ID } = await import('../supabase/functions/game-login/handler.ts');

const request = (ticket, method = 'POST') => new Request('https://api.test/game-login', {
  method, headers: { Origin: 'https://www.ducttapegames.com', ...(ticket ? { 'X-Session-Ticket': ticket } : {}) }
});
async function call(ticket, method) {
  const response = await handler(request(ticket, method));
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}

const results = [];
async function test(name, fn) {
  reset();
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }
const eq = (actual, expected, what) =>
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const linkCalls = () => calls.filter(c => c.call === 'Client/LinkCustomID');

await test('A guest gets their existing random CustomID, and nothing is linked', async () => {
  const { status, body } = await call('guest-ticket');
  eq(status, 200, 'status');
  eq(body.id, 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'id');
  eq(linkCalls().length, 0, 'LinkCustomID calls');
});

await test('A Google account with no CustomID gets a new 40-character random id', async () => {
  const { status, body } = await call('google-ticket');
  eq(status, 200, 'status');
  expect(/^[0-9a-f]{40}$/.test(body.id), `id: ${body.id}`);
});

await test('The new id is linked to that same PlayFab account, as the player, without ForceLink', async () => {
  const { body } = await call('google-ticket');
  const [link] = linkCalls();
  expect(link, 'LinkCustomID was not called');
  eq(link.headers['X-Authorization'], 'google-ticket', 'linked with ticket');
  eq(link.body, { CustomId: body.id, ForceLink: false }, 'LinkCustomID body');
  eq(accounts['google-ticket'].CustomIdInfo.CustomId, body.id, 'CustomID on the account');
});

await test('Asking again returns the same id (one id per player)', async () => {
  const first = await call('google-ticket');
  const second = await call('google-ticket');
  eq(second.body.id, first.body.id, 'id');
  eq(linkCalls().length, 1, 'LinkCustomID calls');
});

await test('Different players get different ids', async () => {
  const google = await call('google-ticket');
  accounts['other-ticket'] = { PlayFabId: 'OTHER0005' };
  const other = await call('other-ticket');
  expect(google.body.id !== other.body.id, 'ids are the same');
});

await test('The id is never the PlayFab ID', async () => {
  const { body } = await call('google-ticket');
  expect(!body.id.includes('GOOGLE002'), body.id);
});

await test("The website account's name is returned with the id", async () => {
  const { body } = await call('google-ticket');
  eq(body.name, 'SkyAce', 'name');
});

await test('If another tab linked an id first, that id is returned', async () => {
  const { status, body } = await call('race-ticket');
  eq(status, 200, 'status');
  eq(body.id, 'r'.repeat(40), 'id');
});

await test('An account whose CustomID is too short is refused (409), and no id is sent', async () => {
  const { status, body } = await call('short-ticket');
  eq(status, 409, 'status');
  eq(body.error, 'GameIdUnavailable', 'error');
  expect(!('id' in body), 'an id was sent');
});

await test('No session ticket: 401 and no id', async () => {
  const { status, body } = await call(null);
  eq(status, 401, 'status');
  expect(!('id' in body), 'an id was sent');
});

await test("Someone else's or a made-up ticket: 401 and no id", async () => {
  const { status, body } = await call('stolen-or-fake');
  eq(status, 401, 'status');
  expect(!('id' in body), 'an id was sent');
  eq(calls.filter(c => c.call === 'Server/GetUserAccountInfo').length, 0, 'account lookups');
});

await test('Only POST is allowed', async () => {
  const { status } = await call('guest-ticket', 'GET');
  eq(status, 405, 'status');
});

await test('The reply is never cached (Cache-Control: no-store)', async () => {
  const { headers } = await call('guest-ticket');
  eq(headers.get('Cache-Control'), 'no-store', 'Cache-Control');
});

await test('GAME_ID accepts 32-100 of A-Z a-z 0-9 - _ and refuses the rest', () => {
  const cases = [['x'.repeat(31), false], ['x'.repeat(32), true], ['x'.repeat(100), true], ['x'.repeat(101), false],
    ['a'.repeat(31) + '@', false], ['A-z_9'.repeat(8), true]];
  for (const [value, expected] of cases) eq(GAME_ID.test(value), expected, `${value.length} chars`);
});

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} game-login tests passed`);
process.exitCode = passed === results.length ? 0 : 1;
