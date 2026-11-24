// link.html: trade a one-time code from the game for a session on that same
// account in this browser.
(() => {
  const t = (key, vars) => (window.DTG_I18N ? DTG_I18N.t(key, vars) : key);
  const form = document.getElementById('link-form');
  const input = document.getElementById('link-code');
  const submit = document.getElementById('link-submit');
  const feedback = document.getElementById('link-feedback');
  const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

  function say(text, isError = false) {
    feedback.textContent = text;
    feedback.classList.toggle('is-error', isError);
    input.setAttribute('aria-invalid', String(isError));
  }

  // Shows "K7QM-3XPA" as the player types.
  input.addEventListener('input', () => {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    input.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  });

  // Leaving a guest account loses it; leaving any other account is just a switch.
  async function okToSwitch() {
    const session = DTGAuth.getSession();
    if (!session) return true;
    const guest = session.method === 'guest';
    const choice = await DTGAuth.showDialog({
      title: guest ? t('link.leaveTitle') : t('link.switchTitle'),
      message: guest
        ? t('link.leaveBody')
        : t('link.switchBody', { name: DTGAuth.displayName(session) }),
      actions: [{ label: t('link.cancel'), value: '' }, { label: guest ? t('link.leaveConfirm') : t('link.switchConfirm'), value: 'go', style: 'blue' }]
    });
    return choice === 'go';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!CODE.test(code)) {
      say(t('link.badCode'), true);
      input.focus();
      return;
    }
    if (!(await DTGAuth.confirmAdult()) || !(await okToSwitch())) return;
    submit.disabled = true;
    say(t('link.checking'));
    try {
      const session = await DTGAuth.redeemLinkCode(code);
      input.value = '';
      form.hidden = true;
      say(t('link.linked', { name: DTGAuth.displayName(session) }));
      const play = Object.assign(document.createElement('a'), { className: 'btn btn-yellow', href: 'games.html', textContent: t('link.play') });
      play.dataset.i18n = 'link.play';
      feedback.after(Object.assign(document.createElement('div'), { className: 'button-row' }));
      feedback.nextElementSibling.append(play);
    } catch (error) {
      console.error('[link]', error);
      say(error.message, true);
      input.focus();
    } finally {
      submit.disabled = false;
    }
  });

  if (!DTGAuth.configured || !window.DTG_CONFIG?.apiBase) {
    say(t('link.unavailable'));
    submit.disabled = true;
    input.disabled = true;
  }
})();
