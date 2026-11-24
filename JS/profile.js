// profile.html: display name, Elo and linked accounts for the signed-in
// player. The server is the source of truth; the session fills in when the
// server is not connected.
(() => {
  const t = (key, vars) => (window.DTG_I18N ? DTG_I18N.t(key, vars) : key);
  const $ = id => document.getElementById(id);
  const NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[ _.-](?=[\p{L}\p{N}]))*$/u;
  const GAME_PROVIDERS = ['google_play_games', 'google_play', 'android_device'];
  let profile = null;
  let loadedFor = null;

  function el(tag, props, text) {
    const node = Object.assign(document.createElement(tag), props);
    if (text) node.textContent = text;
    return node;
  }

  function authButton(label, action, style = 'ghost') {
    const button = el('button', { type: 'button', className: `btn btn-${style} btn-small` }, label);
    button.dataset.authAction = action;
    return button;
  }

  function sayName(text, isError = false) {
    $('name-feedback').textContent = text;
    $('name-feedback').classList.toggle('is-error', isError);
    $('name-input').setAttribute('aria-invalid', String(isError));
  }

  function initials(name) {
    return name.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toUpperCase();
  }

  function render(state) {
    const session = state.session;
    $('profile-loading').hidden = state.status !== 'loading';
    $('profile-signed-out').hidden = state.status !== 'signed-out';
    $('profile-main').hidden = !session;
    if (!session) return;

    // Once the profile loads, its name wins: null means hidden by the name filter.
    const name = DTGAuth.displayName(profile ? { ...session, displayName: profile.displayName } : session);
    const providers = profile?.providers || session.providers || [];
    $('pf-avatar').textContent = initials(name);
    $('pf-name').textContent = name;
    $('pf-sub').textContent = { guest: t('profile.guest'), device: t('profile.device'), google: t('profile.google') }[session.method] || '';
    $('pf-elo').textContent = profile?.elo != null ? profile.elo.toLocaleString() : '–';
    $('pf-since').textContent = profile?.created ? new Date(profile.created).getFullYear() : '–';
    $('pf-browsers').textContent = profile ? profile.linkedBrowsers : '–';
    $('pf-name-issue').hidden = !profile?.displayNameIssue;
    $('pf-name-issue').textContent = profile?.displayNameIssue
      ? t('profile.nameIssue', { issue: profile.displayNameIssue }) : '';

    // Display name: needs a saved (non-guest) account and the server.
    const guest = session.method === 'guest';
    const canRename = !guest && Boolean(profile);
    $('name-form').hidden = !canRename;
    $('name-locked').hidden = canRename;
    $('name-locked').textContent = guest
      ? t('profile.nameLockedGuest')
      : t('profile.nameLocked');
    if (canRename && document.activeElement !== $('name-input') && !$('name-input').dataset.dirty) $('name-input').value = name;
    if (profile?.renameAvailableAt) {
      $('name-submit').disabled = true;
      sayName(t('profile.renameAt', { time: new Date(profile.renameAvailableAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }));
    } else {
      $('name-submit').disabled = false;
    }

    // Linked accounts.
    const hasGoogle = session.method === 'google' || providers.includes('google');
    $('link-google-status').textContent = hasGoogle ? t('profile.googleLinked') : t('profile.googleUnlinked');
    $('link-google-action').replaceChildren(...(hasGoogle ? [] : [authButton(t('profile.linkGoogle'), 'google', 'blue')]));

    const hasGame = session.method === 'device' || providers.some(p => GAME_PROVIDERS.includes(p));
    $('link-game-status').textContent = hasGame
      ? t('profile.gameLinked')
      : t('profile.gameUnlinked');
    $('link-game-action').replaceChildren(...(hasGame ? [] : [el('a', { className: 'btn btn-ghost btn-small', href: 'link.html' }, t('auth.useCode'))]));

    $('link-browser-status').textContent = {
      guest: t('profile.browserGuest'),
      device: t('profile.browserDevice'),
      google: t('profile.browserGoogle')
    }[session.method] || '';
    const browserActions = [authButton(t('profile.signOut'), 'sign-out')];
    if (profile?.linkedBrowsers) {
      const all = el('button', { type: 'button', className: 'btn btn-ghost btn-small', id: 'signout-all' }, t('profile.signOutAll'));
      all.addEventListener('click', signOutAllBrowsers);
      browserActions.push(all);
    }
    $('link-browser-action').replaceChildren(...browserActions);
  }

  async function load(force = false) {
    const session = DTGAuth.getSession();
    if (!session || !window.DTG_CONFIG?.apiBase) return;
    if (!force && loadedFor === session.playFabId) return;
    loadedFor = session.playFabId;
    try {
      profile = (await DTGAuth.api('profile')).profile;
    } catch (error) {
      console.warn('[profile]', error.message);
      profile = null;
      loadedFor = null;
    }
    render(currentState);
  }

  async function post(body) {
    const { profile: updated } = await DTGAuth.api('profile', { method: 'POST', body });
    profile = updated;
    render(currentState);
    return updated;
  }

  async function signOutAllBrowsers() {
    const choice = await DTGAuth.showDialog({
      title: t('profile.signOutAllTitle'),
      message: t('profile.signOutAllBody'),
      actions: [{ label: t('link.cancel'), value: '' }, { label: t('profile.signOutAllConfirm'), value: 'go', style: 'blue' }]
    });
    if (choice !== 'go') return;
    const wasDevice = DTGAuth.getSession()?.method === 'device';
    try {
      await post({ signOutAllBrowsers: true });
      if (wasDevice) await DTGAuth.signOut(); // this browser's token was just revoked too
    } catch (error) {
      sayName(error.message, true);
    }
  }

  $('name-input').addEventListener('input', () => {
    $('name-input').dataset.dirty = '1';
    const value = $('name-input').value.trim();
    if (!value) return sayName('');
    const length = [...value].length;
    if (length < 3) return sayName(t('profile.nameShort'), true);
    if (!NAME.test(value)) return sayName(t('profile.nameInvalid'), true);
    sayName('');
  });

  $('name-form').addEventListener('submit', async event => {
    event.preventDefault();
    const value = $('name-input').value.trim();
    if ([...value].length < 3 || !NAME.test(value)) return $('name-input').dispatchEvent(new Event('input'));
    $('name-submit').disabled = true;
    sayName(t('profile.saving'));
    try {
      try {
        await post({ displayName: value });
      } catch (error) {
        if (error.code !== 'AgeConfirmationRequired') throw error;
        // Accounts linked before the 18+ check was recorded.
        if (!(await DTGAuth.confirmAdult())) throw error;
        await post({ confirmAge: true });
        await post({ displayName: value });
      }
      delete $('name-input').dataset.dirty;
      DTGAuth.updateSession({ displayName: profile.displayName });
      sayName(t('profile.saved', { name: profile.displayName }));
    } catch (error) {
      sayName(error.message, true);
      $('name-submit').disabled = false;
    }
  });

  let currentState = { status: 'loading' };
  DTGAuth.onChange(state => {
    currentState = state;
    if (state.session?.playFabId !== loadedFor) profile = null;
    render(state);
    if (state.status === 'signed-in') load();
  });
  document.addEventListener('dtg:lang', () => render(currentState));
})();
