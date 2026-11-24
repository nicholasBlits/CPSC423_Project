// Account layer: PlayFab guest login, Google sign-in through PlayFab's
// OpenID Connect add-on, linking Google to a guest account, and link codes
// that open a game (Android) account in this browser.
// Only public values are used here; anything needing a secret runs server-side.
// Other scripts use window.DTGAuth (getSession, onChange, api, redeemLinkCode, showDialog).
(() => {
  const config = window.DTG_CONFIG || {};
  const t = (key, vars) => (window.DTG_I18N ? DTG_I18N.t(key, vars) : key);
  // Pages live in html/ except the home page at the root; resolve from this
  // script (JS/) so links work from either place.
  const scriptUrl = document.currentScript.src;
  const pageUrl = name => new URL(name === 'index.html' ? '../index.html' : `../html/${name}`, scriptUrl).href;
  const SESSION_KEY = 'dtg.session';
  const GUEST_KEY = 'dtg.guestCustomId';
  const DEVICE_KEY = 'dtg.deviceToken'; // from a redeemed link code
  const OIDC_KEY = 'dtg.oidcRequest';
  const FLASH_KEY = 'dtg.flash';
  const WARNING_KEY = 'dtg.guestWarningDismissed';
  const AGE_KEY = 'dtg.ageCheck';
  const AGE_POLICY = '2026-10'; // bump to ask everyone again after a policy change
  const AGE_SYNCED_KEY = 'dtg.ageRecordedFor'; // player the server already has it for
  const SESSION_MS = 23 * 3600e3; // PlayFab session tickets last 24 hours
  const VERIFY_MS = 10 * 60e3;
  const INFO = { GetPlayerProfile: true };
  const CLAIMED = ['LinkedIdentifierAlreadyClaimed', 'LinkedAccountAlreadyClaimed'];

  const configured = Boolean(config.playfabTitleId);
  const googleConfigured = configured && Boolean(config.googleClientId);
  if (!configured) console.warn('[DTGAuth] Set playfabTitleId in config.js to turn on sign-in.');
  else if (!googleConfigured) console.warn('[DTGAuth] Set googleClientId in config.js to turn on Google sign-in.');

  // Storage can be blocked (private mode, site data off), so every access is guarded.
  const area = name => (name === 'session' ? sessionStorage : localStorage);
  const store = {
    get(key, name) { try { return JSON.parse(area(name).getItem(key)); } catch { return null; } },
    set(key, value, name) { try { area(name).setItem(key, JSON.stringify(value)); } catch {} },
    remove(key, name) { try { area(name).removeItem(key); } catch {} }
  };

  class PlayFabError extends Error {
    constructor(body) {
      super(body.errorMessage || t('auth.generic'));
      this.code = body.error;
      this.errorCode = body.errorCode;
    }
  }

  async function playfab(path, body, ticket) {
    const headers = { 'Content-Type': 'application/json' };
    if (ticket) headers['X-Authorization'] = ticket;
    let response;
    try {
      response = await fetch(`https://${config.playfabTitleId}.playfabapi.com/Client/${path}`, {
        method: 'POST', headers, body: JSON.stringify(body)
      });
    } catch {
      throw new PlayFabError({ error: 'NetworkError', errorMessage: t('auth.network') });
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.code !== 200) throw new PlayFabError(json);
    return json.data;
  }

  // ---- State ----
  const listeners = new Set();
  let state = { status: 'loading', session: null, message: '', tone: '', busy: '' };
  function setState(patch) {
    state = { ...state, ...patch };
    listeners.forEach(fn => fn(state));
  }

  function saveSession(session) {
    store.set(SESSION_KEY, session);
    setState({ status: 'signed-in', session });
    return session;
  }

  // PlayFab returns the name as set anywhere, including in the game, where it
  // is not filtered. The session check right after login swaps in the
  // server's name, which is null when it is hateful or profane.
  function sessionFromLogin(data, method) {
    queueMicrotask(verifySession);
    return saveSession({
      ticket: data.SessionTicket,
      playFabId: data.PlayFabId,
      method,
      displayName: data.InfoResultPayload?.PlayerProfile?.DisplayName || null,
      newlyCreated: Boolean(data.NewlyCreated),
      expiresAt: Date.now() + SESSION_MS,
      verifiedAt: 0 // checked with the server right away, for the filtered name
    });
  }

  // Sessions started by the server (link code, device token).
  function sessionFromServer(result) {
    return saveSession({
      ticket: result.sessionTicket,
      playFabId: result.playFabId,
      playerId: result.playerId,
      method: 'device',
      displayName: result.displayName || null,
      expiresAt: Date.now() + SESSION_MS,
      verifiedAt: Date.now()
    });
  }

  // ---- Server API (Supabase functions; the ticket is checked server-side) ----
  class ApiError extends Error {
    constructor(status, body) {
      super(body.message || t('auth.generic'));
      this.status = status;
      this.code = body.error;
    }
  }

  async function request(path, { method = 'GET', body } = {}, ticket) {
    if (!config.apiBase) throw new ApiError(0, { error: 'NotConfigured', message: t('auth.notConfigured') });
    const headers = { 'Content-Type': 'application/json' };
    if (ticket) headers['X-Session-Ticket'] = ticket;
    let response;
    try {
      response = await fetch(`${config.apiBase.replace(/\/$/, '')}/${path}`, {
        method, headers, body: body && JSON.stringify(body)
      });
    } catch {
      throw new ApiError(0, { error: 'NetworkError', message: t('auth.network') });
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, json);
    return json;
  }

  // Calls a server function as the signed-in player. A rejected ticket ends
  // the session; guests and link-code browsers are quietly logged back in
  // and the call retried once.
  async function api(path, options) {
    if (!config.apiBase) throw new ApiError(0, { error: 'NotConfigured', message: t('auth.notConfigured') });
    if (!state.session) throw new ApiError(401, { error: 'MissingTicket', message: t('auth.signInFirst') });
    try {
      return await request(path, options, state.session.ticket);
    } catch (error) {
      // Only a rejected ticket or a ban ends the session; other 403s (such as
      // a missing 18+ confirmation) are for the caller to handle.
      const banned = error.status === 403 && error.code === 'Banned';
      if (error.status !== 401 && !banned) throw error;
      const method = endSession(error.status);
      if (error.status !== 401 || !RENEWABLE.includes(method)) throw error;
      await (method === 'guest' ? playAsGuest() : deviceLogin());
      return request(path, options, state.session.ticket);
    }
  }

  const RENEWABLE = ['guest', 'device'];
  const bannedMessage = () => t('auth.banned');

  // Returns the method of the session that ended.
  function endSession(status) {
    const method = state.session?.method;
    store.remove(SESSION_KEY);
    const banned = status === 403;
    const message = banned ? bannedMessage()
      : RENEWABLE.includes(method) ? '' : t('auth.sessionEnded');
    setState({ status: 'signed-out', session: null, message, tone: banned ? 'error' : '' });
    return method;
  }

  // Re-checks a restored session with the server, at most every VERIFY_MS.
  let verifying = false;
  async function verifySession() {
    const session = state.session;
    if (verifying || !config.apiBase || !session || Date.now() - (session.verifiedAt || 0) < VERIFY_MS) return;
    verifying = true;
    try {
      const { player } = await api('session');
      if (state.session?.playFabId === player.playFabId) {
        saveSession({
          ...state.session, verifiedAt: Date.now(), playerId: player.playerId, providers: player.providers,
          displayName: player.displayName // the server's filtered name; null shows the automatic one
        });
      }
    } catch (error) {
      // Server trouble is not the player's fault: keep them signed in.
      if (error.status !== 401 && error.status !== 403) console.warn('[DTGAuth] session check skipped:', error.message);
    } finally {
      verifying = false;
    }
  }

  const displayName = session =>
    session.displayName || `${session.method === 'guest' ? t('auth.guestPrefix') : t('auth.pilotPrefix')}-${session.playFabId.slice(-4)}`;
  const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

  // ---- Guest ----
  async function playAsGuest() {
    let customId = store.get(GUEST_KEY);
    if (!customId) {
      customId = crypto.randomUUID();
      store.set(GUEST_KEY, customId);
    }
    const data = await playfab('LoginWithCustomID', {
      TitleId: config.playfabTitleId, CustomId: customId, CreateAccount: true, InfoRequestParameters: INFO
    });
    return sessionFromLogin(data, 'guest');
  }

  // ---- Link code from the game ----
  // Forgets how this browser reached its previous account, before it
  // switches to another one. The old device token is revoked server-side.
  function forgetLocalLogins() {
    store.remove(GUEST_KEY);
    const token = store.get(DEVICE_KEY);
    store.remove(DEVICE_KEY);
    if (token && config.apiBase) request('device-session', { method: 'POST', body: { deviceToken: token, signOut: true } }).catch(() => {});
  }

  async function redeemLinkCode(code) {
    const result = await request('link-redeem', { method: 'POST', body: { code } });
    forgetLocalLogins();
    store.set(DEVICE_KEY, result.deviceToken);
    return sessionFromServer(result);
  }

  // Renews a link-code browser's session with its device token.
  async function deviceLogin() {
    try {
      return sessionFromServer(await request('device-session', { method: 'POST', body: { deviceToken: store.get(DEVICE_KEY) } }));
    } catch (error) {
      if (error.status === 401) {
        store.remove(DEVICE_KEY);
        setState({ status: 'signed-out', session: null, message: error.message, tone: 'error' });
      } else if (error.status === 403) {
        setState({ status: 'signed-out', session: null, message: bannedMessage(), tone: 'error' });
      }
      throw error;
    }
  }

  // ---- Google (OpenID Connect redirect, response_type=id_token) ----
  const LINKABLE = ['guest', 'device']; // sessions Google can be added to
  const redirectUri = () => config.googleRedirectUri || pageUrl('auth-callback.html');

  function startGoogle() {
    const request = {
      state: randomToken(),
      nonce: randomToken(),
      intent: LINKABLE.includes(state.session?.method) ? 'link' : 'login',
      returnTo: location.href
    };
    store.set(OIDC_KEY, request, 'session');
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: redirectUri(),
      response_type: 'id_token',
      scope: 'openid email', // email: for the one-time welcome email (never stored)
      prompt: 'select_account',
      state: request.state,
      nonce: request.nonce
    });
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  function readClaims(jwt) {
    try {
      const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    } catch {
      return null;
    }
  }

  // Asks the server to send the one-time welcome email for a new account. The
  // server checks the token with Google and against this player's linked
  // Google login. Never blocks or fails sign-in, and never signs anyone out:
  // it uses request(), not api(), so no answer (401, 403 or any other) ends
  // the session.
  async function sendWelcomeEmail(idToken) {
    if (!config.apiBase || !state.session) return;
    try {
      await request('welcome-email', { method: 'POST', body: { idToken } }, state.session.ticket);
    } catch (error) {
      console.warn('[DTGAuth] welcome email not sent:', error.message);
    }
  }

  async function loginWithGoogleToken(idToken) {
    const data = await playfab('LoginWithOpenIdConnect', {
      TitleId: config.playfabTitleId, ConnectionId: config.googleConnectionId, IdToken: idToken,
      CreateAccount: true, InfoRequestParameters: INFO
    });
    forgetLocalLogins(); // this browser now reaches the account through Google
    return sessionFromLogin(data, 'google');
  }

  // Runs on auth-callback.html. Resolves to { outcome, returnTo, idToken? }.
  async function completeGoogle() {
    const request = store.get(OIDC_KEY, 'session');
    store.remove(OIDC_KEY, 'session');
    const params = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname); // keep the token out of history
    const returnTo = safeReturn(request?.returnTo);
    const fail = message => Object.assign(new Error(message), { returnTo });

    if (!request || params.get('state') !== request.state) throw fail(t('auth.expired'));
    if (params.get('error')) {
      throw fail(params.get('error') === 'access_denied' ? t('auth.googleCancelled') : t('auth.googleFailed'));
    }
    const idToken = params.get('id_token');
    const claims = idToken && readClaims(idToken);
    if (!claims || claims.nonce !== request.nonce || claims.aud !== config.googleClientId) {
      throw fail(t('auth.googleUnexpected'));
    }

    const session = state.session;
    if (request.intent === 'link' && LINKABLE.includes(session?.method)) {
      try {
        await playfab('LinkOpenIdConnect', { ConnectionId: config.googleConnectionId, IdToken: idToken }, session.ticket);
      } catch (error) {
        if (CLAIMED.includes(error.code)) return { outcome: 'claimed', from: session.method, idToken, returnTo };
        throw Object.assign(error, { returnTo });
      }
      if (session.method === 'guest') {
        store.remove(GUEST_KEY);
        saveSession({ ...session, method: 'google' });
      } else {
        // A game-code browser keeps renewing with its device token.
        saveSession({ ...session, providers: [...new Set([...(session.providers || []), 'google'])], verifiedAt: 0 });
      }
      await sendWelcomeEmail(idToken); // the account now has Google: it counts as made
      return { outcome: 'linked', from: session.method, returnTo };
    }
    const signedIn = await loginWithGoogleToken(idToken);
    if (signedIn.newlyCreated) await sendWelcomeEmail(idToken);
    return { outcome: 'signed-in', returnTo };
  }

  function safeReturn(href) {
    try {
      const url = new URL(href, location.href);
      if (url.origin === location.origin && !url.pathname.endsWith('auth-callback.html')) return url.href;
    } catch {}
    return pageUrl('index.html');
  }

  function flash(message) { store.set(FLASH_KEY, message, 'session'); }

  // ---- 18+ check (self-declared) before signing in, linking or redeeming a code ----
  // Both answers are offered equally; an under-18 answer is remembered so
  // the question is not simply asked again until it gets the "right" answer.
  const under18 = () => ({
    title: t('auth.under18Title'),
    message: t('auth.under18Body'),
    actions: [{ label: t('auth.ok'), value: 'ok', style: 'blue' }]
  });

  async function confirmAdult() {
    const saved = store.get(AGE_KEY);
    if (saved?.version === AGE_POLICY) {
      if (saved.answer === 'adult') return true;
      await showDialog(under18());
      return false;
    }
    const answer = await showDialog({
      title: t('auth.ageTitle'),
      message: t('auth.ageBody'),
      actions: [{ label: t('auth.under18'), value: 'minor' }, { label: t('auth.adult'), value: 'adult' }]
    });
    if (answer !== 'adult' && answer !== 'minor') return false; // closed without answering
    store.set(AGE_KEY, { answer, version: AGE_POLICY, at: new Date().toISOString() });
    if (answer === 'minor') await showDialog(under18());
    return answer === 'adult';
  }

  // Records the confirmation against the account once it is signed in.
  let ageSyncing = false;
  async function syncAge() {
    const session = state.session;
    const saved = store.get(AGE_KEY);
    if (ageSyncing || !config.apiBase || !session || session.method === 'guest' || session.ageSynced) return;
    const recorded = store.get(AGE_SYNCED_KEY);
    if (recorded?.playFabId === session.playFabId && recorded.version === AGE_POLICY) return; // renewed session, same player
    if (saved?.answer !== 'adult' || saved.version !== AGE_POLICY) return;
    ageSyncing = true;
    try {
      await api('profile', { method: 'POST', body: { confirmAge: true } });
      store.set(AGE_SYNCED_KEY, { playFabId: session.playFabId, version: AGE_POLICY });
      if (state.session?.playFabId === session.playFabId) saveSession({ ...state.session, ageSynced: true });
    } catch (error) {
      console.warn('[DTGAuth] age confirmation not recorded yet:', error.message);
    } finally {
      ageSyncing = false;
    }
  }

  // ---- Sign out ----
  async function signOut() {
    if (state.session?.method === 'guest') {
      const choice = await showDialog({
        title: t('auth.leaveTitle'),
        message: t('auth.leaveBody'),
        actions: [
          { label: t('auth.cancel'), value: '' },
          { label: t('auth.signOutAnyway'), value: 'leave' },
          { label: t('auth.saveGoogle'), value: 'save', style: googleConfigured ? 'blue' : 'ghost', hidden: !googleConfigured }
        ]
      });
      if (choice === 'save') return (await confirmAdult()) && startGoogle();
      if (choice !== 'leave') return;
    }
    store.remove(SESSION_KEY);
    forgetLocalLogins();
    setState({ status: 'signed-out', session: null, message: t('auth.signedOut'), tone: '' });
  }

  // ---- Dialog (native <dialog> handles focus and Escape) ----
  function showDialog({ title, message, actions }) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'modal auth-dialog';
      dialog.setAttribute('aria-labelledby', 'auth-dialog-title');
      const heading = Object.assign(document.createElement('h2'), { id: 'auth-dialog-title', textContent: title });
      const text = Object.assign(document.createElement('p'), { textContent: message });
      const row = Object.assign(document.createElement('div'), { className: 'modal-actions' });
      actions.filter(action => !action.hidden).forEach(({ label, value, style = 'ghost' }) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', className: `btn btn-${style}`, textContent: label });
        button.addEventListener('click', () => dialog.close(value));
        row.append(button);
      });
      dialog.append(heading, text, row);
      dialog.addEventListener('close', () => { dialog.remove(); resolve(dialog.returnValue); });
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  const notReady = () => showDialog({
    title: t('auth.comingSoonTitle'),
    message: t('auth.comingSoonBody'),
    actions: [{ label: t('auth.gotIt'), value: 'ok', style: 'blue' }]
  });

  // ---- Actions from any [data-auth-action] button ----
  async function run(action) {
    if (state.busy) return;
    if (!configured || (action === 'google' && !googleConfigured)) return notReady();
    try {
      if (action === 'guest') {
        setState({ busy: t('auth.startingGuest'), message: '' });
        await playAsGuest();
      } else if (action === 'google') {
        if (!(await confirmAdult())) return;
        setState({ busy: t('auth.openingGoogle'), message: '' });
        startGoogle();
        return;
      } else if (action === 'sign-out') {
        await signOut();
      }
    } catch (error) {
      console.error('[DTGAuth]', action, error);
      setState({ message: error.message, tone: 'error' });
    }
    setState({ busy: '' });
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-auth-action]');
    if (trigger) run(trigger.dataset.authAction);
  });

  // ---- Account strip ----
  function button(label, action, style) {
    const el = Object.assign(document.createElement('button'), { type: 'button', className: `btn btn-${style} btn-small`, textContent: label });
    el.dataset.authAction = action;
    el.disabled = Boolean(state.busy);
    return el;
  }

  function renderStrip(strip) {
    let label = strip.querySelector('small');
    let actions = strip.querySelector('.account-actions');
    if (!actions) {
      label.setAttribute('role', 'status');
      actions = Object.assign(document.createElement('span'), { className: 'account-actions' });
      strip.append(actions);
    }
    const { status, session, message, tone, busy } = state;
    const buttons = [];
    let text;
    if (!configured) text = t('auth.accountsSoon');
    else if (status === 'loading') text = t('auth.checking');
    else if (!session) {
      text = t('auth.notSignedIn');
      buttons.push(button(t('auth.playGuest'), 'guest', 'ghost'), button(t('auth.signInGoogle'), 'google', 'blue'));
      if (config.apiBase) buttons.push(codeLink());
    } else if (session.method === 'guest') {
      text = t('auth.playingGuest', { name: displayName(session) });
      buttons.push(button(t('auth.saveProgress'), 'google', 'blue'), profileLink(), button(t('auth.signOut'), 'sign-out', 'ghost'));
    } else if (session.method === 'device') {
      text = t('auth.signedInGame', { name: displayName(session) });
      buttons.push(profileLink(), button(t('auth.signOut'), 'sign-out', 'ghost'));
    } else {
      text = t('auth.signedInGoogle', { name: displayName(session) });
      buttons.push(profileLink(), button(t('auth.signOut'), 'sign-out', 'ghost'));
    }
    label.textContent = busy || (message ? t('auth.joinStatus', { message, status: text }) : text);
    label.classList.toggle('is-error', !busy && tone === 'error');
    actions.replaceChildren(...buttons);
  }

  function profileLink() {
    return Object.assign(document.createElement('a'), { className: 'btn btn-ghost btn-small', href: pageUrl('profile.html'), textContent: t('auth.profile') });
  }

  function codeLink() {
    const link = Object.assign(document.createElement('a'), { className: 'btn btn-ghost btn-small', href: pageUrl('link.html'), textContent: t('auth.useCode') });
    if (state.busy) link.setAttribute('aria-disabled', 'true');
    return link;
  }

  listeners.add(() => document.querySelectorAll('[data-account-strip]').forEach(renderStrip));
  document.addEventListener('dtg:lang', () => document.querySelectorAll('[data-account-strip]').forEach(renderStrip));

  // ---- Guest warning: only for guests, until dismissed for this visit ----
  function renderGuestWarnings() {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(WARNING_KEY) === state.session?.playFabId; } catch {}
    const show = state.session?.method === 'guest' && !dismissed;
    document.querySelectorAll('[data-guest-warning]').forEach(warning => { warning.hidden = !show; });
  }

  listeners.add(renderGuestWarnings);
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-dismiss-guest-warning]')) return;
    try { sessionStorage.setItem(WARNING_KEY, state.session?.playFabId || ''); } catch {}
    renderGuestWarnings();
  });

  // Keep tabs in step when another tab signs in or out.
  window.addEventListener('storage', event => {
    if (event.key !== SESSION_KEY) return;
    const session = store.get(SESSION_KEY);
    setState({ status: session ? 'signed-in' : 'signed-out', session, message: '' });
  });

  listeners.add(() => { if (state.status === 'signed-in') syncAge(); });

  // ---- Start up ----
  function init() {
    const message = store.get(FLASH_KEY, 'session') || '';
    store.remove(FLASH_KEY, 'session');
    const saved = store.get(SESSION_KEY);
    if (saved && saved.expiresAt > Date.now()) {
      setState({ status: 'signed-in', session: saved, message });
      verifySession();
      return;
    }
    store.remove(SESSION_KEY);
    if (config.apiBase && store.get(DEVICE_KEY)) {
      // Browser linked with a game code: renew with its device token.
      deviceLogin().catch(error => {
        console.error('[DTGAuth] device refresh', error);
        if (state.status === 'loading') setState({ status: 'signed-out', message: error.message, tone: 'error' });
      });
      return;
    }
    if (configured && store.get(GUEST_KEY)) {
      // Returning guest: quietly start a fresh ticket for the same account.
      playAsGuest().catch(error => {
        console.error('[DTGAuth] guest refresh', error);
        setState({ status: 'signed-out', message: error.message, tone: 'error' });
      });
      return;
    }
    const expired = saved?.method === 'google' ? t('auth.googleExpired') : '';
    setState({ status: 'signed-out', message: message || expired });
  }

  window.DTGAuth = {
    get configured() { return configured; },
    getSession: () => state.session,
    pageUrl,
    onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    playfab: (path, body) => playfab(path, body, state.session?.ticket),
    api,
    redeemLinkCode,
    confirmAdult,
    signOut: () => run('sign-out'),
    ensureSession: () => (state.session ? Promise.resolve(state.session) : playAsGuest()),
    updateSession(patch) { if (state.session) saveSession({ ...state.session, ...patch }); },
    showDialog,
    displayName,
    completeGoogle,
    loginWithGoogleToken,
    flash,
    store
  };

  init();
})();
