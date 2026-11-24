// A failed welcome email must never sign anyone out. Runs the real JS/auth.js
// in a fake browser, completes a Google sign-in (new account, and a guest
// saving with Google), and has the welcome-email function fail in every way.
// Run: node tests/auth-welcome.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'JS/auth.js'), 'utf8');
const CLIENT_ID = 'client-id.apps.googleusercontent.com';
const API = 'https://api.test/functions/v1';

function storage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    data
  };
}
const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const idTokenFor = nonce => `${b64url({ alg: 'RS256' })}.${b64url({ aud: CLIENT_ID, nonce, sub: 'google-sub' })}.sig`;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// welcome: what the welcome-email function answers ({ status, body } or 'network').
function setup({ welcome, intent }) {
  const request = { state: 'st', nonce: 'nn', intent, returnTo: 'https://site.test/games' };
  const local = storage(intent === 'link' ? {
    'dtg.session': JSON.stringify({ ticket: 'guest-ticket', playFabId: 'GUEST0001', method: 'guest', expiresAt: Date.now() + 3600e3, verifiedAt: Date.now() }),
    'dtg.guestCustomId': JSON.stringify('guest-custom-id')
  } : {});
  const session = storage({ 'dtg.oidcRequest': JSON.stringify(request) });
  const calls = [];

  const fetch = async (url, init = {}) => {
    url = String(url);
    calls.push(url.replace(/^https:\/\/[^/]+/, ''));
    if (url.endsWith('/Client/LoginWithOpenIdConnect')) {
      return json(200, { code: 200, data: { SessionTicket: 'google-ticket', PlayFabId: 'NEW000001', NewlyCreated: true, InfoResultPayload: {} } });
    }
    if (url.endsWith('/Client/LinkOpenIdConnect')) return json(200, { code: 200, data: {} });
    if (url.endsWith('/Client/LoginWithCustomID')) {
      return json(200, { code: 200, data: { SessionTicket: 'new-guest-ticket', PlayFabId: 'GUEST9999', NewlyCreated: true, InfoResultPayload: {} } });
    }
    if (url === `${API}/session`) {
      const ticket = init.headers['X-Session-Ticket'];
      const playFabId = ticket === 'google-ticket' ? 'NEW000001' : 'GUEST0001';
      return json(200, { player: { playFabId, playerId: 'p1', providers: ['google'], displayName: null } });
    }
    if (url === `${API}/welcome-email`) {
      if (welcome === 'network') throw new TypeError('Failed to fetch');
      return json(welcome.status, welcome.body);
    }
    throw new Error(`unexpected request: ${url}`);
  };

  const document = {
    currentScript: { src: 'https://site.test/JS/auth.js' },
    addEventListener() {},
    querySelectorAll: () => [],
    createElement: () => ({ append() {}, addEventListener() {} }),
    body: { append() {} }
  };
  const window = {
    DTG_CONFIG: { playfabTitleId: 'E1BA8', googleClientId: CLIENT_ID, googleConnectionId: 'google', apiBase: API },
    addEventListener() {}
  };
  const context = {
    window, document, fetch, URL, URLSearchParams, crypto: globalThis.crypto, atob, queueMicrotask, setTimeout,
    localStorage: local, sessionStorage: session,
    location: { hash: `#state=st&id_token=${idTokenFor('nn')}`, href: 'https://site.test/html/auth-callback.html', pathname: '/html/auth-callback.html', origin: 'https://site.test' },
    history: { replaceState() {} },
    console: { ...console, warn() {}, error() {} }
  };
  vm.runInNewContext(AUTH_JS, context);
  return { auth: window.DTGAuth, calls, local };
}

const tick = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

const results = [];
async function test(name, fn) {
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

const FAILURES = [
  ['400 bad Google token', { status: 400, body: { error: 'InvalidGoogleToken', message: 'x' } }],
  ['401 (what the old function sent)', { status: 401, body: { error: 'InvalidGoogleToken', message: 'x' } }],
  ['403 Google not linked', { status: 403, body: { error: 'GoogleNotLinked', message: 'x' } }],
  ['403 Banned', { status: 403, body: { error: 'Banned', message: 'x' } }],
  ['500 server error', { status: 500, body: { error: 'ServerError', message: 'x' } }],
  ['network down', 'network']
];

(async () => {
  for (const [label, welcome] of FAILURES) {
    await test(`New Google account stays signed in when the welcome email fails: ${label}`, async () => {
      const t = setup({ welcome, intent: 'login' });
      const result = await t.auth.completeGoogle();
      await tick();
      const session = t.auth.getSession();
      expect(result.outcome === 'signed-in', `outcome ${result.outcome}`);
      expect(session && session.method === 'google' && session.playFabId === 'NEW000001', `session: ${JSON.stringify(session)}`);
      expect(t.calls.includes('/functions/v1/welcome-email'), 'welcome email was not requested');
    });

    await test(`Guest saving with Google stays signed in when the welcome email fails: ${label}`, async () => {
      const t = setup({ welcome, intent: 'link' });
      const result = await t.auth.completeGoogle();
      await tick();
      const session = t.auth.getSession();
      expect(result.outcome === 'linked', `outcome ${result.outcome}`);
      expect(session && session.method === 'google' && session.playFabId === 'GUEST0001', `session: ${JSON.stringify(session)}`);
      expect(!t.calls.some(c => c.endsWith('/Client/LoginWithCustomID')), 'a new guest account was started');
    });
  }

  await test('A sent welcome email leaves the session as it was', async () => {
    const t = setup({ welcome: { status: 200, body: { sent: true } }, intent: 'login' });
    await t.auth.completeGoogle();
    await tick();
    expect(t.auth.getSession()?.method === 'google', 'not signed in');
  });

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} welcome sign-out tests passed`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
