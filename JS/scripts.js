// Shared across every page. Each block checks that its elements exist,
// since not every page has the modal, player, or invite form.
const t = (key, vars) => (window.DTG_I18N ? DTG_I18N.t(key, vars) : key);
const menuButton = document.getElementById('menu-toggle');
const nav = document.getElementById('main-nav');
function syncMenuLabel() {
  if (!menuButton || !nav) return;
  const open = nav.classList.contains('is-open');
  menuButton.setAttribute('aria-label', t(open ? 'nav.menuClose' : 'nav.menuOpen'));
}
if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
    syncMenuLabel();
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    syncMenuLabel();
  }));
  document.addEventListener('dtg:lang', syncMenuLabel);
}

const backdrop = document.getElementById('info-modal');
if (backdrop) {
  const dialog = backdrop.querySelector('.modal');
  let returnFocus = null;
  const messages = {
    tournament: ['modal.tournament.title', 'modal.tournament.body'],
    standings: ['modal.standings.title', 'modal.standings.body'],
    friends: ['modal.friends.title', 'modal.friends.body'],
    moderation: ['modal.moderation.title', 'modal.moderation.body']
  };
  function openModal(type, trigger) {
    const [titleKey, messageKey] = messages[type] || ['modal.title', 'modal.body'];
    const title = t(titleKey);
    const message = t(messageKey);
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    returnFocus = trigger;
    backdrop.hidden = false;
    dialog.focus();
  }
  function closeModal() {
    backdrop.hidden = true;
    if (returnFocus) returnFocus.focus();
  }
  document.querySelectorAll('[data-demo-action]').forEach(button =>
    button.addEventListener('click', () => openModal(button.dataset.demoAction, button))
  );
  document.getElementById('modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  document.addEventListener('keydown', event => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab') {
      event.preventDefault();
      document.getElementById('modal-close').focus();
    }
  });
}

const copyInvite = document.getElementById('copy-invite');
if (copyInvite) {
  copyInvite.addEventListener('click', async () => {
    const value = document.getElementById('invite-url').dataset.inviteUrl;
    const status = document.getElementById('copy-status');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const selection = document.createElement('textarea');
        selection.value = value;
        selection.style.position = 'fixed';
        selection.style.opacity = '0';
        document.body.appendChild(selection);
        selection.select();
        const copied = document.execCommand('copy');
        selection.remove();
        if (!copied) throw new Error('Copy unavailable');
      }
      status.textContent = t('copy.ok');
    } catch {
      status.textContent = t('copy.fail');
    }
  });
}

const joinForm = document.getElementById('join-form');
if (joinForm) {
  joinForm.addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('join-code');
    const code = input.value.trim().toUpperCase();
    const feedback = document.getElementById('join-feedback');
    if (!/^[A-Z0-9]{4,6}$/.test(code)) {
      feedback.textContent = t('join.invalid');
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.setAttribute('aria-invalid', 'false');
    feedback.textContent = t('join.ok');
  });
}
