// Tests for the website → Unity login bridge (JS/webgl.js) and the WebGL build
// settings (JS/config.js). Runs the real files against a fake page, a fake
// DTGAuth and a fake Unity instance. Run: node tests/webgl.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WEBGL_JS = fs.readFileSync(path.join(ROOT, 'JS/webgl.js'), 'utf8');
const CONFIG_JS = fs.readFileSync(path.join(ROOT, 'JS/config.js'), 'utf8');
// The page's English copy (games.html loads JS/i18n.js before webgl.js).
const ENGLISH = require(path.join(ROOT, 'JS/i18n-catalog.js')).en;
const I18N = { t: (key, vars = {}) => (ENGLISH[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => vars[name] ?? m) };

function loadConfig() {
  const window = {};
  vm.runInNewContext(CONFIG_JS, { window });
  return window.DTG_CONFIG;
}

const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

// Secret ids the fake server hands out, one per PlayFab account.
const ID_A = 'a'.repeat(40);
const ID_B = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e'; // a guest's UUID (36 chars)
// Names the fake server's filter hides, like the real one would.
const HIDDEN = ['KillJews', 'Nazi'];
const SECRETS = { ABCDEF123: ID_A, GUEST0001: ID_B, OTHER0002: 'c'.repeat(40) };

// Builds a fake games.html and runs webgl.js in it.
function setup({ session = null, configured = true, readyDuringLoad = false, server, fullscreen = {} } = {}) {
  const element = (props = {}) => ({
    hidden: false, disabled: false, textContent: '', style: {}, attrs: {}, listeners: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    focus() {},
    ...props
  });
  // Browser full screen: `fullscreen.player` / `fullscreen.canvas` is 'standard',
  // 'webkit' or 'none' (default 'standard'); `fullscreen.unity` is how the
  // game's SetFullscreen behaves: 'works' (default), 'error', 'nothing' or 'missing'.
  const docListeners = {};
  const fire = type => (docListeners[type] || []).slice().forEach(fn => fn());
  const requests = [];
  const fullscreenable = (name, kind = 'standard') => {
    if (kind === 'none') return {};
    const enter = function () { requests.push({ element: name, kind }); document.fullscreenElement = this; setImmediate(() => fire('fullscreenchange')); };
    return kind === 'webkit' ? { webkitRequestFullscreen: enter } : { requestFullscreen: async function () { enter.call(this); } };
  };
  const player = element({ name: 'player', ...fullscreenable('player', fullscreen.player) });
  const canvas = element({ name: 'canvas', parentElement: player, clientWidth: 1280, clientHeight: 720, width: 300, height: 150, ...fullscreenable('canvas', fullscreen.canvas) });
  const elements = {
    'browser-play': element(), 'unity-canvas': canvas, 'game-progress': element(),
    'game-progress-fill': element(), 'progress-label': element(), 'player-placeholder': element(),
    'player-controls': element({ hidden: true }), 'game-fullscreen': element(), 'fullscreen-note': element({ hidden: true })
  };
  const sent = [];
  const warnings = [];
  const apiCalls = [];
  const listeners = new Set();
  const auth = {
    session,
    configured,
    ensureCalls: 0,
    getSession: () => auth.session,
    displayName: s => s.displayName || `${s.method === 'guest' ? 'Guest' : 'Pilot'}-${s.playFabId.slice(-4)}`,
    onChange(fn) { listeners.add(fn); fn(); },
    async api(route, options) {
      apiCalls.push({ route, method: options?.method, playFabId: auth.session?.playFabId });
      if (server) return server(auth.session);
      // Like the real game-login: the name after the server's filter (null when hidden).
      const name = auth.session.displayName ?? null;
      return { id: SECRETS[auth.session.playFabId], name: HIDDEN.includes(name) ? null : name };
    },
    async ensureSession() {
      auth.ensureCalls++;
      auth.set({ ticket: 'guest-ticket', playFabId: 'GUEST0001', method: 'guest' });
    },
    showDialog: async () => '',
    // Test helper: change the session the way auth.js does, then notify.
    set(next) { auth.session = next; listeners.forEach(fn => fn()); }
  };

  const window = { DTG_I18N: I18N };
  const unity = { createOptions: null, loginAtCreate: undefined, fullscreenCalls: [], instance: { SendMessage: (o, m, a) => sent.push({ object: o, method: m, arg: a }) } };
  const unityMode = fullscreen.unity || 'works';
  if (unityMode !== 'missing') {
    unity.instance.SetFullscreen = value => {
      unity.fullscreenCalls.push(value);
      if (unityMode === 'works') { document.fullscreenElement = canvas; setImmediate(() => fire('fullscreenchange')); }
      if (unityMode === 'error') setImmediate(() => fire('fullscreenerror'));
    };
  }
  window.createUnityInstance = async (canvas, options, onProgress) => {
    unity.createOptions = options;
    unity.loginAtCreate = window.DTG_LOGIN;
    onProgress(1);
    if (readyDuringLoad) readyDuringLoad(window, auth); // the game's Start() runs before the promise resolves
    return unity.instance;
  };
  const document = {
    getElementById: id => elements[id] || null,
    createElement: () => ({}),
    querySelector: () => null,
    body: { append(script) { setImmediate(() => script.onload()); } },
    fullscreenElement: null,
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); },
    async exitFullscreen() { document.fullscreenElement = null; setImmediate(() => fire('fullscreenchange')); }
  };
  window.devicePixelRatio = 2;
  const context = {
    window, document, DTGAuth: auth, URLSearchParams, DTG_I18N: I18N, setTimeout, clearTimeout,
    location: { search: '' },
    console: { ...console, warn: (...args) => warnings.push(args.join(' ')), error: () => {} }
  };
  window.DTG_CONFIG = loadConfig();
  vm.runInNewContext(WEBGL_JS, context);

  const play = async () => {
    await elements['browser-play'].listeners.click();
    await tick();
  };
  const fullscreenClick = async () => {
    await elements['game-fullscreen'].listeners.click();
    await tick();
  };
  return { window, document, auth, sent, warnings, apiCalls, unity, elements, requests, play, fullscreenClick, fire };
}

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
const eq = (actual, expected, what) =>
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const GOOGLE = { ticket: 'ticket-1', playFabId: 'ABCDEF123', method: 'google', displayName: 'SkyAce' };
const OTHER = { ticket: 'ticket-9', playFabId: 'OTHER0002', method: 'google', displayName: 'Maverick' };

(async () => {
  // ---- config.js ----
  await test('config.js: the four build files exist in webgl/Build', () => {
    const { webgl } = loadConfig();
    for (const key of ['loaderUrl', 'dataUrl', 'frameworkUrl', 'codeUrl']) {
      expect(fs.existsSync(path.join(ROOT, 'html', webgl[key])), `${key} is missing on disk: ${webgl[key]}`);
    }
  });

  await test('config.js: StreamingAssets folder exists and version is 7.42', () => {
    const { webgl } = loadConfig();
    expect(fs.existsSync(path.join(ROOT, 'html', webgl.streamingAssetsUrl)), 'StreamingAssets missing');
    eq(webgl.productVersion, '7.42', 'productVersion');
  });

  await test('config.js: createUnityInstance gets the 7.42 build files', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    eq(path.basename(t.unity.createOptions.codeUrl), 'b969dea6ea761a700a5f577966480a3c.wasm.unityweb', 'codeUrl');
    eq(path.basename(t.unity.createOptions.dataUrl), '1b7e544724becc9ff9173f11b85d4936.data.unityweb', 'dataUrl');
  });

  // ---- The secret id ----
  await test('window.DTG_LOGIN is { id, name } with the secret id before the game loads', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    eq(t.unity.loginAtCreate, { id: ID_A, name: 'SkyAce' }, 'DTG_LOGIN at load');
  });

  await test('The id comes from the game-login server function (POST, as the signed-in player)', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    eq(t.apiCalls, [{ route: 'game-login', method: 'POST', playFabId: 'ABCDEF123' }], 'server calls');
  });

  await test('The id is 32-100 random characters, never the PlayFab ID or an email', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    const { id } = t.unity.loginAtCreate;
    expect(/^[A-Za-z0-9_-]{32,100}$/.test(id), `id has the wrong shape: ${id}`);
    expect(id !== GOOGLE.playFabId && !id.includes('@'), 'id is a plain user id');
  });

  await test('No ticket or PlayFab ID is put in DTG_LOGIN', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    const json = JSON.stringify(t.unity.loginAtCreate);
    expect(!json.includes('ticket-1') && !json.includes('ABCDEF123'), json);
  });

  await test('Nothing is fetched or set until Play is pressed', async () => {
    const t = setup({ session: GOOGLE });
    await tick();
    eq(t.apiCalls.length, 0, 'server calls');
    eq(t.window.DTG_LOGIN, undefined, 'DTG_LOGIN');
  });

  await test('A short id from the server is refused and the game does not start', async () => {
    const t = setup({ session: GOOGLE, server: () => ({ id: 'short-id', name: null }) });
    await t.play();
    eq(t.unity.createOptions, null, 'createUnityInstance called');
    eq(t.elements['progress-label'].textContent, 'The game login could not be set up. Please try again.', 'message');
    eq(t.elements['browser-play'].disabled, false, 'Play disabled');
  });

  await test('A server error shows its message and the game does not start', async () => {
    const t = setup({ session: GOOGLE, server: () => { throw new Error('This account cannot open the browser game yet.'); } });
    await t.play();
    eq(t.unity.createOptions, null, 'createUnityInstance called');
    eq(t.elements['progress-label'].textContent, 'This account cannot open the browser game yet.', 'message');
  });

  // ---- Name on the start screen ----
  await test("name is the website account's name", async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    eq(t.unity.loginAtCreate.name, 'SkyAce', 'name');
  });

  await test('A guest with no chosen name gets the name the site shows (Guest-0001)', async () => {
    const t = setup({ session: { ticket: 't', playFabId: 'GUEST0001', method: 'guest' } });
    await t.play();
    eq(t.unity.loginAtCreate, { id: ID_B, name: 'Guest-0001' }, 'DTG_LOGIN');
  });

  await test('A name the server hid is never sent: the game gets the automatic name', async () => {
    const t = setup({ session: { ...GOOGLE, displayName: 'KillJews' } });
    await t.play();
    eq(t.unity.loginAtCreate, { id: ID_A, name: 'Pilot-F123' }, 'DTG_LOGIN at load');
  });

  await test('A brand-new guest whose PlayFab name is hidden gets the automatic name too', async () => {
    const t = setup({ session: null });
    t.auth.ensureSession = async () => { t.auth.ensureCalls++; t.auth.set({ ticket: 'g', playFabId: 'GUEST0001', method: 'guest', displayName: 'Nazi' }); };
    await t.play();
    eq(t.unity.loginAtCreate, { id: ID_B, name: 'Guest-0001' }, 'DTG_LOGIN at load');
  });

  await test('A blank name (filter removed it) gets the automatic name', async () => {
    const t = setup({ session: { ...GOOGLE, displayName: null } });
    await t.play();
    eq(t.unity.loginAtCreate, { id: ID_A, name: 'Pilot-F123' }, 'DTG_LOGIN at load');
  });

  await test('A name of only spaces is left out, and the game still gets its id', async () => {
    const t = setup({ session: { ...GOOGLE, displayName: '   ' } });
    await t.play();
    eq(t.unity.loginAtCreate, { id: ID_A }, 'DTG_LOGIN at load');
  });

  await test('The game never gets an empty or too-short name', async () => {
    for (const displayName of ['', 'A', 'AB', ' AB ', null]) {
      const t = setup({ session: { ...GOOGLE, displayName } });
      await t.play();
      const { name } = t.unity.loginAtCreate;
      expect(name === undefined || (name.length >= 3 && name.length <= 25), `${JSON.stringify(displayName)} sent name ${JSON.stringify(name)}`);
    }
  });

  await test('After a hidden name, a new name chosen on the site is sent', async () => {
    const t = setup({ session: { ...GOOGLE, displayName: 'KillJews' } });
    await t.play();
    t.auth.set({ ...GOOGLE, displayName: 'SkyAce' });
    await tick();
    eq(t.sent.map(m => JSON.parse(m.arg)), [{ id: ID_A, name: 'SkyAce' }], 'Login messages');
  });

  await test('A renamed account sends Login with the new name', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    t.auth.set({ ...GOOGLE, displayName: 'NewName' });
    await tick();
    eq(t.sent.map(m => JSON.parse(m.arg)), [{ id: ID_A, name: 'NewName' }], 'Login messages');
  });

  // ---- Keeping the game in step ----
  await test('No Login message at startup: the game reads DTG_LOGIN', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    t.window.dtgWebBridgeReady();
    eq(t.sent.length, 0, 'messages sent');
  });

  await test("A different player signing in sends SendMessage('DTGWebBridge', 'Login', their id)", async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    t.auth.set(OTHER);
    await tick();
    eq(t.sent.map(m => [m.object, m.method, JSON.parse(m.arg)]), [['DTGWebBridge', 'Login', { id: 'c'.repeat(40), name: 'Maverick' }]], 'messages');
  });

  await test('A renewed ticket for the same player sends nothing and asks the server once', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    t.auth.set({ ...GOOGLE, ticket: 'ticket-2' });
    await tick();
    eq(t.sent.length, 0, 'messages sent');
    eq(t.apiCalls.length, 1, 'server calls');
  });

  await test('Signing out sends nothing and clears DTG_LOGIN', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    t.auth.set(null);
    await tick();
    eq(t.sent.length, 0, 'messages sent');
    eq(t.window.DTG_LOGIN, undefined, 'DTG_LOGIN');
  });

  await test('A player switch while the game loads is sent once the game is ready', async () => {
    const t = setup({
      session: GOOGLE,
      readyDuringLoad: (window, auth) => { auth.set(OTHER); window.dtgWebBridgeReady(); }
    });
    await t.play();
    await tick();
    eq(t.sent.map(m => JSON.parse(m.arg).id), ['c'.repeat(40)], 'Login ids');
  });

  // ---- Other ----
  await test('No session: the site starts a guest, then the game gets that guest’s id', async () => {
    const t = setup({ session: null });
    await t.play();
    eq(t.auth.ensureCalls, 1, 'ensureSession calls');
    eq(t.unity.loginAtCreate.id, ID_B, 'id');
  });

  await test('No session and sign-in not set up: the game does not start', async () => {
    const t = setup({ session: null, configured: false });
    await t.play();
    eq(t.unity.createOptions, null, 'createUnityInstance called');
    eq(t.elements['progress-label'].textContent, 'Sign-in is not set up yet, so the game cannot start.', 'message');
  });

  await test("dtgWebBridgeEvent('login_failed', reason) is logged as a warning", async () => {
    const t = setup({ session: GOOGLE });
    t.window.dtgWebBridgeEvent('login_failed', 'id too short');
    t.window.dtgWebBridgeEvent('login_ok', 'SkyAce');
    eq(t.warnings.length, 1, 'warnings');
    expect(t.warnings[0].includes('id too short'), `warning text: ${t.warnings[0]}`);
  });

  // ---- Full screen ----
  await test('The Full screen button is hidden until the game has loaded', async () => {
    const t = setup({ session: GOOGLE });
    await tick();
    eq(t.elements['player-controls'].hidden, true, 'hidden before Play');
    await t.play();
    eq(t.elements['player-controls'].hidden, false, 'hidden after load');
  });

  await test('The Full screen button stays hidden when the game fails to start', async () => {
    const t = setup({ session: GOOGLE, server: () => ({ id: 'short-id', name: null }) });
    await t.play();
    eq(t.elements['player-controls'].hidden, true, 'hidden');
  });

  await test('Full screen calls the Unity instance SetFullscreen(1), with no fallback', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    await t.fullscreenClick();
    eq(t.unity.fullscreenCalls, [1], 'SetFullscreen calls');
    eq(t.requests, [], 'Fullscreen API requests');
    eq(t.document.fullscreenElement.name, 'canvas', 'full screen element');
  });

  await test('If SetFullscreen fails, the player container goes full screen', async () => {
    const t = setup({ session: GOOGLE, fullscreen: { unity: 'error' } });
    await t.play();
    await t.fullscreenClick();
    eq(t.unity.fullscreenCalls, [1], 'SetFullscreen calls');
    eq(t.requests, [{ element: 'player', kind: 'standard' }], 'Fullscreen API requests');
  });

  await test('If SetFullscreen does nothing, the player goes full screen after a short wait', async () => {
    const t = setup({ session: GOOGLE, fullscreen: { unity: 'nothing' } });
    await t.play();
    await t.fullscreenClick();
    await new Promise(resolve => setTimeout(resolve, 800));
    await tick();
    eq(t.requests, [{ element: 'player', kind: 'standard' }], 'Fullscreen API requests');
  });

  await test('Safari: the webkit-prefixed API is used, falling back to the canvas', async () => {
    const t = setup({ session: GOOGLE, fullscreen: { unity: 'missing', player: 'none', canvas: 'webkit' } });
    await t.play();
    await t.fullscreenClick();
    eq(t.requests, [{ element: 'canvas', kind: 'webkit' }], 'Fullscreen API requests');
    eq(t.elements['fullscreen-note'].hidden, true, 'note hidden');
  });

  await test('No full screen support: a note says so', async () => {
    const t = setup({ session: GOOGLE, fullscreen: { unity: 'missing', player: 'none', canvas: 'none' } });
    await t.play();
    await t.fullscreenClick();
    eq(t.elements['fullscreen-note'].hidden, false, 'note hidden');
    eq(t.elements['fullscreen-note'].textContent, 'Full screen is not available in this browser.', 'note');
  });

  await test('fullscreenchange resizes the canvas, and exiting drops inline sizes', async () => {
    const t = setup({ session: GOOGLE });
    await t.play();
    const canvas = t.elements['unity-canvas'];
    await t.fullscreenClick();
    Object.assign(canvas, { clientWidth: 1920, clientHeight: 1080 });
    canvas.style.width = '1920px';
    canvas.style.height = '1080px';
    t.fire('fullscreenchange');
    eq([canvas.width, canvas.height], [3840, 2160], 'full screen canvas size');
    Object.assign(canvas, { clientWidth: 640, clientHeight: 360 });
    await t.fullscreenClick(); // a second click exits
    eq(t.document.fullscreenElement, null, 'full screen element');
    eq([canvas.style.width, canvas.style.height], ['', ''], 'inline size');
    eq([canvas.width, canvas.height], [1280, 720], 'normal canvas size');
  });

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} webgl tests passed`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
