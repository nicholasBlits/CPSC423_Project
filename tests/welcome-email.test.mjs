// Tests for the welcome-email server function (supabase/functions/welcome-email).
// Runs the real handler in Node with Google, PlayFab, the database and n8n faked.
// Run: node --no-warnings tests/welcome-email.test.mjs
const CLIENT_ID = '524219297367-test.apps.googleusercontent.com';
const env = {
  PLAYFAB_TITLE_ID: 'E1BA8',
  PLAYFAB_SECRET_KEY: 'test-secret',
  SUPABASE_URL: 'https://db.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: CLIENT_ID,
  N8N_WELCOME_WEBHOOK_URL: 'https://n8n.test/webhook/dtg-welcome-email',
  N8N_WEBHOOK_SECRET: 'n8n-secret',
  ALLOWED_ORIGINS: 'https://www.ducttapegames.com'
};
globalThis.Deno = { env: { get: name => env[name] } };

let state;
function reset() {
  state = {
    // PlayFab accounts by session ticket
    accounts: {
      'ann-ticket': { PlayFabId: 'ANN000001', TitleInfo: { DisplayName: 'SkyAce' }, OpenIdInfo: [{ ConnectionId: 'google', Subject: 'google-ann' }] },
      'guest-ticket': { PlayFabId: 'GUEST0002', CustomIdInfo: { CustomId: 'x' } },
      'bob-ticket': { PlayFabId: 'BOB000003', TitleInfo: { DisplayName: '<b>Bob</b>' }, OpenIdInfo: [{ ConnectionId: 'google', Subject: 'google-bob' }] }
    },
    // Google ID tokens Google would accept
    tokens: {
      'ann-token': { aud: CLIENT_ID, iss: 'https://accounts.google.com', sub: 'google-ann', email: 'ann@example.com', email_verified: 'true' },
      'bob-token': { aud: CLIENT_ID, iss: 'accounts.google.com', sub: 'google-bob', email: 'bob@example.com', email_verified: 'true' },
      'other-site-token': { aud: 'someone-else.apps.googleusercontent.com', iss: 'accounts.google.com', sub: 'google-ann', email: 'ann@example.com', email_verified: 'true' },
      'unverified-token': { aud: CLIENT_ID, iss: 'accounts.google.com', sub: 'google-ann', email: 'ann@example.com', email_verified: 'false' }
    },
    players: {}, // playfab_id -> row
    emails: [],
    n8nFails: false,
    calls: []
  };
}
const byId = id => Object.values(state.accounts).find(a => a.PlayFabId === id);
// The handler caches playFabId -> playerId across tests, so a row may be asked for
// before this test's upsert: create it on first use, like the real table holds it.
const rowById = id => {
  const playFabId = id.replace('player-', '');
  return (state.players[playFabId] ??= { id, welcome_email_sent_at: null });
};
const ok = data => new Response(JSON.stringify({ code: 200, data }), { status: 200 });
const fail = (status, error) => new Response(JSON.stringify({ code: status, error, errorMessage: error }), { status });
const rows = list => new Response(JSON.stringify(list), { status: 200 });

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  state.calls.push(url.replace(/\?.*/, ''));
  if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const claims = state.tokens[new URL(url).searchParams.get('id_token')];
    return claims ? new Response(JSON.stringify(claims), { status: 200 }) : new Response('{"error":"invalid_token"}', { status: 400 });
  }
  if (url === env.N8N_WELCOME_WEBHOOK_URL) {
    if (state.n8nFails) return new Response('{"message":"Error in workflow"}', { status: 500 });
    state.emails.push({ ...body, secret: init.headers['X-DTG-Secret'] });
    return new Response('{"ok":true}', { status: 200 });
  }
  if (url.endsWith('/Server/AuthenticateSessionTicket')) {
    const account = state.accounts[body.SessionTicket];
    return account ? ok({ UserInfo: account, IsSessionTicketExpired: false }) : fail(400, 'InvalidSessionTicket');
  }
  if (url.endsWith('/Server/GetUserAccountInfo')) return ok({ UserInfo: byId(body.PlayFabId) });
  if (url.startsWith('https://db.test/rest/v1/players')) {
    const params = new URL(url).searchParams;
    if (init.method === 'POST') { // ensurePlayer upsert
      const row = state.players[body.playfab_id] ??= { id: `player-${body.playfab_id}`, welcome_email_sent_at: null };
      return rows([{ id: row.id }]);
    }
    if (init.method === 'PATCH') {
      const row = rowById(params.get('id').replace('eq.', ''));
      if (!row) return rows([]);
      if (params.get('welcome_email_sent_at') === 'is.null' && row.welcome_email_sent_at) return rows([]);
      Object.assign(row, body);
      return rows([{ id: row.id }]);
    }
  }
  throw new Error(`unexpected request: ${init.method ?? 'GET'} ${url}`);
};

const { handler } = await import('../supabase/functions/welcome-email/handler.ts');
const { readFileSync } = await import('node:fs');
const workflow = JSON.parse(readFileSync(new URL('../n8n/welcome-email.workflow.json', import.meta.url), 'utf8'));

async function call(ticket, body = {}, method = 'POST') {
  const response = await handler(new Request('https://api.test/welcome-email', {
    method,
    headers: { Origin: 'https://www.ducttapegames.com', 'Content-Type': 'application/json', ...(ticket ? { 'X-Session-Ticket': ticket } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  }));
  return { status: response.status, body: await response.json().catch(() => null) };
}

const results = [];
async function test(name, fn) {
  reset();
  const quiet = console.error;
  console.error = () => {}; // the handler logs expected failures
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${error.message}`);
  } finally {
    console.error = quiet;
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }
const eq = (actual, expected, what) =>
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

await test('A new Google account is handed to n8n once, with its Google address and name', async () => {
  const { status, body } = await call('ann-ticket', { idToken: 'ann-token' });
  eq([status, body], [200, { sent: true }], 'reply');
  eq(state.emails.length, 1, 'n8n calls');
  eq([state.emails[0].email, state.emails[0].name], ['ann@example.com', 'SkyAce'], 'email and name');
});

await test('The n8n webhook gets the secret header', async () => {
  await call('ann-ticket', { idToken: 'ann-token' });
  eq(state.emails[0].secret, 'n8n-secret', 'X-DTG-Secret');
});

await test('A player with no name, or a hidden hateful name, is greeted as "pilot"', async () => {
  state.accounts['ann-ticket'].TitleInfo.DisplayName = 'KillJews';
  await call('ann-ticket', { idToken: 'ann-token' });
  eq(state.emails[0].name, 'pilot', 'name');
});

await test('A second request does not send a second email', async () => {
  await call('ann-ticket', { idToken: 'ann-token' });
  const again = await call('ann-ticket', { idToken: 'ann-token' });
  eq(again.body, { sent: false, reason: 'AlreadySent' }, 'reply');
  eq(state.emails.length, 1, 'emails sent');
});

await test('Only the time of sending is stored, never the email address', async () => {
  await call('ann-ticket', { idToken: 'ann-token' });
  const row = state.players.ANN000001;
  expect(row.welcome_email_sent_at, 'welcome_email_sent_at not set');
  expect(!JSON.stringify(row).includes('ann@example.com'), JSON.stringify(row));
});

await test("Someone else's Google token is refused (403) and nothing is sent", async () => {
  const { status, body } = await call('ann-ticket', { idToken: 'bob-token' });
  eq([status, body.error], [403, 'GoogleNotLinked'], 'reply');
  eq(state.emails.length, 0, 'emails sent');
});

await test('A guest account with no Google login is refused', async () => {
  const { status } = await call('guest-ticket', { idToken: 'ann-token' });
  eq(status, 403, 'status');
  eq(state.emails.length, 0, 'emails sent');
});

await test('A token Google rejects is refused (400, never 401)', async () => {
  const { status, body } = await call('ann-ticket', { idToken: 'forged-token' });
  eq([status, body.error], [400, 'InvalidGoogleToken'], 'reply');
  eq(state.emails.length, 0, 'emails sent');
});

await test('A token made for a different site is refused (400, never 401)', async () => {
  const { status, body } = await call('ann-ticket', { idToken: 'other-site-token' });
  eq([status, body.error], [400, 'InvalidGoogleToken'], 'reply');
});

await test('An unverified email gets nothing', async () => {
  const { status, body } = await call('ann-ticket', { idToken: 'unverified-token' });
  eq([status, body.error], [400, 'NoVerifiedEmail'], 'reply');
  eq(state.emails.length, 0, 'emails sent');
});

await test('No session ticket: 401, and Google is never asked', async () => {
  const { status } = await call(null, { idToken: 'ann-token' });
  eq(status, 401, 'status');
  expect(!state.calls.some(c => c.includes('tokeninfo')), 'tokeninfo was called');
});

await test('Missing or oversized token: 400', async () => {
  eq((await call('ann-ticket', {})).status, 400, 'missing');
  eq((await call('ann-ticket', { idToken: 'x'.repeat(5000) })).status, 400, 'oversized');
});

await test('If n8n fails, the player can get it on a later sign-in', async () => {
  state.n8nFails = true;
  const first = await call('ann-ticket', { idToken: 'ann-token' });
  eq(first.status, 502, 'first status');
  eq(state.players.ANN000001.welcome_email_sent_at, null, 'sent marker after failure');
  state.n8nFails = false;
  const second = await call('ann-ticket', { idToken: 'ann-token' });
  eq(second.body, { sent: true }, 'second reply');
});

await test('nameHtml is escaped for the HTML email, and the workflow uses it there', async () => {
  await call('bob-ticket', { idToken: 'bob-token' });
  eq(state.emails[0].nameHtml, '&lt;b&gt;Bob&lt;/b&gt;', 'nameHtml');
  const send = workflow.nodes.find(n => n.type === 'n8n-nodes-base.emailSend');
  expect(send.parameters.html.includes('$json.body.nameHtml') && !send.parameters.html.includes('$json.body.name }}'), 'html uses the raw name');
});

await test('Only POST is allowed', async () => {
  eq((await call('ann-ticket', null, 'GET')).status, 405, 'status');
});

await test('The n8n workflow is a webhook (header auth, answers after sending) into a send-email step', () => {
  const hook = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  const send = workflow.nodes.find(n => n.type === 'n8n-nodes-base.emailSend');
  eq([hook.parameters.httpMethod, hook.parameters.authentication, hook.parameters.responseMode], ['POST', 'headerAuth', 'lastNode'], 'webhook');
  eq(send.parameters.toEmail, '={{ $json.body.email }}', 'to');
  eq(workflow.connections[hook.name].main[0][0].node, send.name, 'connection');
});

await test('Email copy in the workflow follows the Battle Planes rules (Avioane; hit, miss or kill; no "Battleship")', () => {
  const { text, html, subject } = workflow.nodes.find(n => n.type === 'n8n-nodes-base.emailSend').parameters;
  eq(subject, 'Welcome to Duct Tape Games', 'subject');
  for (const copy of [text, html]) {
    expect(copy.includes('Avioane'), 'Avioane missing');
    expect(copy.includes('a hit, a miss or a kill'), 'shot results missing');
    expect(!/battleship|sunk|destroyed/i.test(copy), 'banned wording');
  }
});

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} welcome-email tests passed`);
process.exitCode = passed === results.length ? 0 : 1;
