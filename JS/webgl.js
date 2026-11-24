// games.html: loads the Unity WebGL build and hands it the website's account.
// The game never logs in on its own in the browser: if nobody is signed in
// when Play is pressed, the site starts a guest first, so the game and the
// site share one identity. The game logs in with the player's secret id (their
// account's PlayFab CustomID, from the game-login server function), passed as
// window.DTG_LOGIN before load and SendMessage('DTGWebBridge', 'Login') after,
// never through page markup or storage.
(() => {
  const t = (key, vars) => (window.DTG_I18N ? DTG_I18N.t(key, vars) : key);
  const play = document.getElementById('browser-play');
  if (!play) return;
  const config = window.DTG_CONFIG || {};
  const build = config.webgl;
  const canvas = document.getElementById('unity-canvas');
  const progress = document.getElementById('game-progress');
  const fill = document.getElementById('game-progress-fill');
  const label = document.getElementById('progress-label');
  const placeholder = document.getElementById('player-placeholder');
  const player = canvas.parentElement;
  const controls = document.getElementById('player-controls');
  const fullscreenButton = document.getElementById('game-fullscreen');
  const fullscreenNote = document.getElementById('fullscreen-note');
  const BRIDGE = 'DTGWebBridge'; // GameObject name in the Unity scene
  let instance = null;

  // UGS lobby join code from the URL (?join=ABC123, #join=ABC123, or /join/ABC123), for friend invites.
  const joinCode = window.parseJoinCode
    ? window.parseJoinCode(location.search, location.hash, location.pathname)
    : null;

  // The site's PlayFab session, for the game's account actions.
  function payload() {
    const session = DTGAuth.getSession();
    if (!session) return '';
    return JSON.stringify({
      ticket: session.ticket,
      playFabId: session.playFabId,
      playerId: session.playerId || '',
      method: session.method,
      displayName: DTGAuth.displayName(session),
      joinCode: joinCode || ''
    });
  }

  // The game's login: { id, name }. `id` is the account's secret id (32-100
  // random characters) from the server, which only gives it to that signed-in
  // player; it is kept in memory only. `name` is the name the site shows.
  const GAME_ID = /^[A-Za-z0-9_-]{32,100}$/;
  // game-login also returns the account's name after the server's name filter
  // (null when hidden). A session started a moment ago can still hold the
  // unfiltered name from PlayFab, so a name the server hid is never sent: the
  // game gets the automatic one ("Pilot-1a2b") instead. A name too short for
  // the game (under 3 characters) is left out; the game treats it as optional.
  let gameId = null; // { playFabId, id, hidden }
  async function loginFor(session) {
    if (gameId?.playFabId !== session.playFabId) {
      const { id, name } = await DTGAuth.api('game-login', { method: 'POST' });
      if (typeof id !== 'string' || !GAME_ID.test(id)) throw new Error('The game login could not be set up. Please try again.');
      const hidden = name == null && session.displayName ? session.displayName : null;
      gameId = { playFabId: session.playFabId, id, hidden };
    }
    const shown = session.displayName && session.displayName !== gameId.hidden ? session : { ...session, displayName: null };
    const name = DTGAuth.displayName(shown).trim().slice(0, 25);
    return { id: gameId.id, ...(name.length >= 3 ? { name } : {}) };
  }

  function setProgress(value, text) {
    const percent = Math.round(value * 100);
    fill.style.width = `${percent}%`;
    progress.setAttribute('aria-valuenow', String(percent));
    label.textContent = text ?? t('webgl.loading', { percent });
  }

  // Sends the current login to the game, once per change. Signed out: nothing,
  // and the game keeps its last account until another player signs in here.
  let lastSent = null;
  function sendLogin() {
    if (!instance || !window.DTG_LOGIN) return;
    const json = JSON.stringify(window.DTG_LOGIN);
    if (json === lastSent) return;
    lastSent = json;
    instance.SendMessage(BRIDGE, 'Login', json);
  }

  // Called by the game's bridge. The game already read window.DTG_LOGIN at
  // startup, so ready only sends a login that changed while it loaded. Ready
  // can come before createUnityInstance resolves, so it is remembered.
  let bridgeReady = false;
  window.dtgWebBridgeReady = () => {
    bridgeReady = true;
    sendLogin();
  };
  window.dtgWebBridgeEvent = (event, data) => {
    if (event === 'login_failed') console.warn('[webgl] The game could not use the website login:', data);
  };

  // Account actions the game can ask for (Save with Google, open profile).
  window.DTGWebGL = {
    getSession: payload,
    async requestAccountAction(action) {
      if (action === 'profile') return window.open('profile.html', '_blank', 'noopener');
      if (action !== 'save') return;
      const choice = await DTGAuth.showDialog({
        title: t('webgl.saveTitle'),
        message: t('webgl.saveBody'),
        actions: [{ label: t('webgl.notNow'), value: '' }, { label: t('webgl.continueGoogle'), value: 'go', style: 'blue' }]
      });
      if (choice === 'go') document.querySelector('[data-account-strip] [data-auth-action="google"]')?.click();
    }
  };

  // Keep the game in step when the site switches player, renames or signs out.
  // Only once the game has started: the secret id is fetched for Play, not on page load.
  let started = false;
  let update = 0;
  DTGAuth.onChange(async () => {
    if (!started) return;
    const run = ++update;
    const session = DTGAuth.getSession();
    if (!session) {
      window.DTG_LOGIN = undefined;
      return;
    }
    try {
      const login = await loginFor(session);
      if (run !== update) return; // a newer change won
      window.DTG_LOGIN = login;
      sendLogin();
    } catch (error) {
      console.warn('[webgl] could not update the game login:', error.message);
    }
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement('script'), { src, async: true });
      script.onload = resolve;
      script.onerror = () => reject(new Error(t('webgl.downloadFail')));
      document.body.append(script);
    });
  }

  // Full screen: the game's own SetFullscreen(1) first, then the browser's
  // Fullscreen API on the player, then the canvas (webkit prefix for Safari).
  // Esc leaves full screen (browser default).
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  // Resolves true once something is full screen, false on an error or after `ms`.
  function waitForFullscreen(ms) {
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'fullscreenerror', 'webkitfullscreenerror'];
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        events.forEach(type => document.removeEventListener(type, done));
        resolve(Boolean(fullscreenElement()));
      };
      const timer = setTimeout(done, ms);
      events.forEach(type => document.addEventListener(type, done));
    });
  }

  async function requestFullscreen(element) {
    const request = element?.requestFullscreen || element?.webkitRequestFullscreen;
    if (!request) return false;
    const entered = waitForFullscreen(1000);
    try {
      await request.call(element); // the webkit version returns nothing
    } catch {
      return false;
    }
    return fullscreenElement() ? true : entered;
  }

  async function toggleFullscreen() {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      return exit?.call(document)?.catch?.(() => {});
    }
    fullscreenNote.hidden = true;
    // Unity issues no request when its runtime is not ready, so its call is
    // only trusted once the browser reports full screen; the fallback must
    // still run inside the click's user activation (a few seconds).
    if (typeof instance?.SetFullscreen === 'function') {
      const entered = waitForFullscreen(700);
      try {
        instance.SetFullscreen(1);
        if (await entered) return;
      } catch (error) {
        console.warn('[webgl] SetFullscreen failed:', error.message);
      }
    }
    for (const element of [player, canvas]) {
      if (await requestFullscreen(element)) return;
    }
    fullscreenNote.textContent = 'Full screen is not available in this browser.';
    fullscreenNote.hidden = false;
  }

  // Unity matches its drawing buffer to the canvas's CSS size every frame;
  // this just avoids a stretched frame and drops any inline size Unity's
  // fullscreen left on the canvas, so it fills the player again.
  function fitCanvas() {
    if (canvas.hidden) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (width > 0 && height > 0) {
      canvas.width = width;
      canvas.height = height;
    }
  }
  function onFullscreenChange() {
    if (!fullscreenElement()) {
      canvas.style.width = '';
      canvas.style.height = '';
    }
    fitCanvas();
    window.requestAnimationFrame?.(fitCanvas);
    canvas.focus();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  fullscreenButton?.addEventListener('click', toggleFullscreen);

  async function start() {
    if (!build?.loaderUrl) {
      label.textContent = t('webgl.unavailable');
      return;
    }
    play.disabled = true;
    try {
      if (!DTGAuth.getSession()) {
        if (!DTGAuth.configured) throw new Error(t('webgl.noSignIn'));
        setProgress(0, t('webgl.startingGuest'));
        await DTGAuth.ensureSession();
      }
      setProgress(0, 'Connecting your account…');
      window.DTG_LOGIN = await loginFor(DTGAuth.getSession()); // read by the game at startup
      started = true;
      setProgress(0);
      await loadScript(build.loaderUrl);
      canvas.hidden = false; // under the placeholder until the game is ready
      lastSent = JSON.stringify(window.DTG_LOGIN);
      instance = await window.createUnityInstance(canvas, {
        dataUrl: build.dataUrl,
        frameworkUrl: build.frameworkUrl,
        codeUrl: build.codeUrl,
        streamingAssetsUrl: build.streamingAssetsUrl || 'StreamingAssets',
        companyName: 'Duct Tape Games',
        productName: 'Battle Planes',
        productVersion: build.productVersion || '1.0'
      }, value => setProgress(value));
      if (bridgeReady) sendLogin();
      placeholder.hidden = true;
      if (controls) controls.hidden = false;
      canvas.focus();
    } catch (error) {
      console.error('[webgl]', error);
      canvas.hidden = true;
      placeholder.hidden = false;
      label.textContent = error.message || t('webgl.startFail');
      play.disabled = false;
    }
  }

  play.addEventListener('click', start);
  if (joinCode) label.textContent = t('webgl.inviteReady', { code: joinCode });
})();
