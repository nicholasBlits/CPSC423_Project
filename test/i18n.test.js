const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const english = require('../JS/i18n-catalog.js').en;
const locales = {
  'zh-Hans': require('../JS/locales/zh-Hans.js'),
  'zh-Hant': require('../JS/locales/zh-Hant.js'),
  ro: require('../JS/locales/ro.js'),
  uk: require('../JS/locales/uk.js'),
  ru: require('../JS/locales/ru.js')
};
const { normalizeLang } = require('../JS/i18n.js');

const pages = [
  'index.html',
  'html/about.html',
  'html/auth-callback.html',
  'html/contact.html',
  'html/games.html',
  'html/link.html',
  'html/privacy.html',
  'html/privacy-wordsinacircle.html',
  'html/profile.html',
  'html/terms.html',
  'games/battle-planes.html'
];

describe('translation catalog', () => {
  const keys = Object.keys(english);

  for (const [code, bag] of Object.entries(locales)) {
    test(`${code} has the same keys as English`, () => {
      const missing = keys.filter(key => !Object.prototype.hasOwnProperty.call(bag, key));
      const extra = Object.keys(bag).filter(key => !Object.prototype.hasOwnProperty.call(english, key));
      assert.deepStrictEqual(missing, []);
      assert.deepStrictEqual(extra, []);
      for (const key of keys) assert.notStrictEqual(String(bag[key]).trim(), '', key);
    });
  }

  test('normalizes browser and query language tags', () => {
    assert.strictEqual(normalizeLang('zh-CN'), 'zh-Hans');
    assert.strictEqual(normalizeLang('zh-TW'), 'zh-Hant');
    assert.strictEqual(normalizeLang('zh-HK'), 'zh-Hant');
    assert.strictEqual(normalizeLang('ro-RO'), 'ro');
    assert.strictEqual(normalizeLang('uk-UA'), 'uk');
    assert.strictEqual(normalizeLang('ru'), 'ru');
    assert.strictEqual(normalizeLang('en-US'), 'en');
    assert.strictEqual(normalizeLang('fr'), '');
  });
});

describe('pages', () => {
  const attr = /data-i18n(?:-html|-aria|-alt|-placeholder|-content)?="([^"]+)"/g;

  for (const file of pages) {
    test(`${file} references known strings and loads the switcher`, () => {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      assert.match(html, /i18n-boot\.js/);
      assert.match(html, /i18n\.js/);
      const used = new Set();
      for (const match of html.matchAll(attr)) used.add(match[1]);
      const missing = [...used].filter(key => !Object.prototype.hasOwnProperty.call(english, key));
      assert.deepStrictEqual(missing, []);
    });
  }
});

describe('language switcher', () => {
  test('translates the home navigation and keeps the choice', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://ducttapegames.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
    const { window } = dom;
    window.localStorage.setItem('dtg.lang', 'ro');
    for (const file of [
      'JS/i18n-catalog.js',
      'JS/locales/zh-Hans.js',
      'JS/locales/zh-Hant.js',
      'JS/locales/ro.js',
      'JS/locales/uk.js',
      'JS/locales/ru.js',
      'JS/i18n.js'
    ]) {
      const script = window.document.createElement('script');
      script.textContent = fs.readFileSync(path.join(root, file), 'utf8');
      window.document.body.append(script);
    }
    const home = window.document.querySelector('[data-i18n="nav.home"]');
    assert.strictEqual(home.textContent, 'Acasă');
    assert.strictEqual(window.document.documentElement.lang, 'ro');
    assert.strictEqual(window.localStorage.getItem('dtg.lang'), 'ro');

    const button = window.document.querySelector('.lang-button');
    assert.ok(button);
    assert.strictEqual(button.getAttribute('aria-haspopup'), 'listbox');
    button.click();
    const menu = window.document.getElementById('lang-menu');
    assert.strictEqual(menu.hidden, false);
    const russian = menu.querySelector('[data-lang="ru"]');
    russian.click();
    assert.strictEqual(home.textContent, 'Главная');
    assert.strictEqual(window.document.documentElement.lang, 'ru');
    assert.strictEqual(menu.hidden, true);
    assert.strictEqual(window.document.querySelector('.lang-label-full').textContent, 'Русский');
  });
});
