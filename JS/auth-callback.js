// Google sends the browser here after sign-in. Finish the PlayFab login or
// link, then return to the page the player started from.
(async () => {
  const t = (key, vars) => (window.DTG_I18N ? DTG_I18N.t(key, vars) : key);
  const title = document.getElementById('callback-title');
  const message = document.getElementById('callback-message');
  const actions = document.getElementById('callback-actions');

  function show(heading, text, buttons = []) {
    title.textContent = heading;
    message.textContent = text;
    actions.replaceChildren(...buttons);
  }

  function action(label, style, onClick) {
    const el = Object.assign(document.createElement('button'), { type: 'button', className: `btn btn-${style}`, textContent: label });
    el.addEventListener('click', onClick);
    return el;
  }

  function back(returnTo) {
    return Object.assign(document.createElement('a'), { className: 'btn btn-ghost', href: returnTo, textContent: t('callback.back') });
  }

  function finish(text, returnTo) {
    DTGAuth.flash(text);
    location.replace(returnTo);
  }

  let result;
  try {
    result = await DTGAuth.completeGoogle();
  } catch (error) {
    console.error('[DTGAuth] callback', error);
    show(t('callback.failed'), error.message, [back(error.returnTo || DTGAuth.pageUrl('index.html'))]);
    return;
  }

  const { outcome, returnTo, idToken, from } = result;
  const guest = from === 'guest';
  if (outcome === 'linked') {
    return finish(guest ? t('callback.savedGuest') : t('callback.linked'), returnTo);
  }
  if (outcome === 'signed-in') return finish(t('callback.signedIn'), returnTo);

  // The Google account already belongs to another player account.
  show(
    t('callback.claimedTitle'),
    guest ? t('callback.claimedGuest') : t('callback.claimedOther'),
    [
      action(t('callback.switch'), 'blue', async event => {
        event.currentTarget.disabled = true;
        try {
          await DTGAuth.loginWithGoogleToken(idToken);
          finish(t('callback.signedIn'), returnTo);
        } catch (error) {
          console.error('[DTGAuth] switch', error);
          show(t('callback.failed'), error.message, [back(returnTo)]);
        }
      }),
      action(guest ? t('callback.stayGuest') : t('callback.stay'), 'ghost', () => location.replace(returnTo))
    ]
  );
})();
