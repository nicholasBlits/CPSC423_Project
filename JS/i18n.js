// Language switcher and page translation. Strings live in i18n-catalog.js.
// English stays in the HTML; this script replaces marked nodes for the
// saved language, ?lang=, or the browser language on the first visit.
(() => {
  const LANGS = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'zh-Hans', label: '简体中文', short: '简' },
    { code: 'zh-Hant', label: '繁體中文', short: '繁' },
    { code: 'ro', label: 'Română', short: 'RO' },
    { code: 'uk', label: 'Українська', short: 'УКР' },
    { code: 'ru', label: 'Русский', short: 'РУ' }
  ];
  const STORAGE_KEY = 'dtg.lang';
  const ALIASES = {
    en: 'en',
    'zh-hans': 'zh-Hans',
    'zh-cn': 'zh-Hans',
    'zh-sg': 'zh-Hans',
    zh: 'zh-Hans',
    'zh-hant': 'zh-Hant',
    'zh-tw': 'zh-Hant',
    'zh-hk': 'zh-Hant',
    'zh-mo': 'zh-Hant',
    ro: 'ro',
    uk: 'uk',
    ru: 'ru'
  };

  function normalizeLang(input) {
    if (!input) return '';
    const lower = String(input).trim().replace(/_/g, '-').toLowerCase();
    if (ALIASES[lower]) return ALIASES[lower];
    return ALIASES[lower.split('-')[0]] || '';
  }

  function catalog() {
    return Object.assign({}, window.DTG_I18N_CATALOG, window.DTG_I18N_LOCALES);
  }

  let lang = 'en';

  function translate(key, vars) {
    const bags = catalog();
    const localized = bags[lang] || {};
    const english = bags.en || {};
    let value = Object.prototype.hasOwnProperty.call(localized, key) ? localized[key] : english[key];
    if (value == null) return key;
    if (vars) {
      value = String(value).replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? '' : String(vars[name])));
    }
    return value;
  }

  function apply(root) {
    const scope = root && root.querySelectorAll ? root : document;
    document.documentElement.lang = lang;
    document.documentElement.classList.remove('i18n-pending');
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = translate(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = translate(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', translate(el.getAttribute('data-i18n-aria')));
    });
    scope.querySelectorAll('[data-i18n-alt]').forEach(el => {
      el.setAttribute('alt', translate(el.getAttribute('data-i18n-alt')));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.setAttribute('placeholder', translate(el.getAttribute('data-i18n-placeholder')));
    });
    scope.querySelectorAll('[data-i18n-content]').forEach(el => {
      el.setAttribute('content', translate(el.getAttribute('data-i18n-content')));
    });
    scope.querySelectorAll('[data-show-lang]').forEach(el => {
      el.hidden = el.getAttribute('data-show-lang') !== lang;
    });
    syncSwitcher();
  }

  function syncSwitcher() {
    const current = LANGS.find(item => item.code === lang) || LANGS[0];
    const button = document.querySelector('.lang-button');
    if (!button) return;
    const full = button.querySelector('.lang-label-full');
    const short = button.querySelector('.lang-label-short');
    if (full) full.textContent = current.label;
    if (short) short.textContent = current.short;
    button.setAttribute('aria-label', `${translate('lang.choose')}: ${current.label}`);
    const menu = document.querySelector('.lang-menu');
    if (menu) menu.setAttribute('aria-label', translate('lang.menu'));
    document.querySelectorAll('.lang-menu [role="option"]').forEach(option => {
      const selected = option.dataset.lang === lang;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
  }

  function setLang(code) {
    const next = normalizeLang(code) || 'en';
    lang = next;
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch {}
    apply();
    document.dispatchEvent(new CustomEvent('dtg:lang', { detail: { lang } }));
  }

  function initialLang() {
    let fromQuery = '';
    try { fromQuery = normalizeLang(new URLSearchParams(window.location.search).get('lang')); } catch {}
    if (fromQuery) return fromQuery;
    try {
      const stored = normalizeLang(window.localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch {}
    const list = window.navigator.languages || [window.navigator.language || ''];
    for (const item of list) {
      const match = normalizeLang(item);
      if (match) return match;
    }
    return 'en';
  }

  function mountSwitcher() {
    const host = document.querySelector('.header-actions') || document.querySelector('.header-row');
    if (!host || document.querySelector('.lang-switch')) return;

    const widget = document.createElement('div');
    widget.className = 'lang-switch';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lang-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'lang-menu');
    button.innerHTML = '<svg class="lang-globe" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 12h18M12 3c2.6 2.8 3.9 6 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-6-3.9-9s1.3-6.2 3.9-9z"/></svg><span class="lang-label-full"></span><span class="lang-label-short"></span><span class="lang-caret" aria-hidden="true">▾</span>';

    const menu = document.createElement('ul');
    menu.id = 'lang-menu';
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    menu.setAttribute('aria-label', translate('lang.menu'));

    LANGS.forEach(item => {
      const option = document.createElement('li');
      option.setAttribute('role', 'option');
      option.dataset.lang = item.code;
      option.tabIndex = -1;
      option.textContent = item.label;
      option.setAttribute('lang', item.code);
      menu.append(option);
    });

    function openMenu() {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      const selected = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
      selected?.focus();
    }

    function closeMenu(focusButton) {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focusButton) button.focus();
    }

    button.addEventListener('click', () => {
      if (menu.hidden) openMenu();
      else closeMenu(false);
    });

    menu.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      setLang(option.dataset.lang);
      closeMenu(true);
    });

    menu.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('[role="option"]')];
      const index = options.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowDown') next = (index + 1) % options.length;
        if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = options.length - 1;
        options[next].focus();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const option = document.activeElement.closest('[role="option"]');
        if (!option) return;
        setLang(option.dataset.lang);
        closeMenu(true);
      }
    });

    document.addEventListener('click', event => {
      if (!widget.contains(event.target)) closeMenu(false);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu(true);
    });

    widget.append(button, menu);
    host.append(widget);
  }

  const api = {
    LANGS,
    normalizeLang,
    get lang() { return lang; },
    t: translate,
    setLang,
    apply
  };

  if (typeof window !== 'undefined') window.DTG_I18N = api;

  if (typeof document !== 'undefined') {
    mountSwitcher();
    setLang(initialLang());
  }
})();

if (typeof module === 'object' && module.exports) {
  const ALIASES = {
    en: 'en',
    'zh-hans': 'zh-Hans',
    'zh-cn': 'zh-Hans',
    'zh-sg': 'zh-Hans',
    zh: 'zh-Hans',
    'zh-hant': 'zh-Hant',
    'zh-tw': 'zh-Hant',
    'zh-hk': 'zh-Hant',
    'zh-mo': 'zh-Hant',
    ro: 'ro',
    uk: 'uk',
    ru: 'ru'
  };
  module.exports = {
    normalizeLang(input) {
      if (!input) return '';
      const lower = String(input).trim().replace(/_/g, '-').toLowerCase();
      if (ALIASES[lower]) return ALIASES[lower];
      return ALIASES[lower.split('-')[0]] || '';
    }
  };
}
