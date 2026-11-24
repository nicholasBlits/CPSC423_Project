#!/usr/bin/env node
/**
 * Pre-generate static HTML for all languages with proper SEO tags.
 * Creates /zh-hans/, /zh-hant/, /ro/, /uk/, /ru/ directories with translated pages.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE_URL = 'https://ducttapegames.com';
const LANGS = [
  { code: 'en', label: 'English', isDefault: true },
  { code: 'zh-Hans', label: '简体中文', urlCode: 'zh-hans' },
  { code: 'zh-Hant', label: '繁體中文', urlCode: 'zh-hant' },
  { code: 'ro', label: 'Română', urlCode: 'ro' },
  { code: 'uk', label: 'Українська', urlCode: 'uk' },
  { code: 'ru', label: 'Русский', urlCode: 'ru' }
];

// Pages to generate (exclude auth-callback, link, profile - these are dynamic/auth pages)
const PUBLIC_PAGES = [
  { source: 'index.html', path: '', outputName: 'index.html' },
  { source: 'html/about.html', path: 'about', outputName: 'about.html' },
  { source: 'html/contact.html', path: 'contact', outputName: 'contact.html' },
  { source: 'html/games.html', path: 'games', outputName: 'games.html' },
  { source: 'html/privacy.html', path: 'privacy', outputName: 'privacy.html' },
  { source: 'html/privacy-wordsinacircle.html', path: 'privacy-wordsinacircle', outputName: 'privacy-wordsinacircle.html' },
  { source: 'html/terms.html', path: 'terms', outputName: 'terms.html' },
  { source: 'games/battle-planes.html', path: 'games/battle-planes', outputName: 'battle-planes.html' }
];

const NOINDEX_PAGES = ['html/auth-callback.html', 'html/link.html', 'html/profile.html'];

// Load catalogs
const root = path.join(__dirname, '..');
const english = require('../JS/i18n-catalog.js').en;
const locales = {
  'zh-Hans': require('../JS/locales/zh-Hans.js'),
  'zh-Hant': require('../JS/locales/zh-Hant.js'),
  ro: require('../JS/locales/ro.js'),
  uk: require('../JS/locales/uk.js'),
  ru: require('../JS/locales/ru.js')
};

function translate(key, lang) {
  if (lang === 'en') return english[key] || key;
  const bag = locales[lang] || {};
  return bag[key] || english[key] || key;
}

function getCanonicalUrl(pagePath, langCode) {
  const isDefault = langCode === 'en';
  const lang = LANGS.find(l => l.code === langCode);
  const urlLangCode = lang?.urlCode || langCode;
  
  if (!pagePath) {
    return isDefault ? `${BASE_URL}/` : `${BASE_URL}/${urlLangCode}/`;
  }
  return isDefault ? `${BASE_URL}/${pagePath}` : `${BASE_URL}/${urlLangCode}/${pagePath}`;
}

function generateHreflangLinks(pagePath) {
  const links = [];
  
  for (const lang of LANGS) {
    const url = getCanonicalUrl(pagePath, lang.code);
    const hreflang = lang.code === 'zh-Hans' ? 'zh-Hans' : 
                     lang.code === 'zh-Hant' ? 'zh-Hant' : lang.urlCode || lang.code;
    links.push(`  <link rel="alternate" hreflang="${hreflang}" href="${url}">`);
  }
  
  // Add x-default (English)
  links.push(`  <link rel="alternate" hreflang="x-default" href="${getCanonicalUrl(pagePath, 'en')}">`);
  
  return links.join('\n');
}

function adjustRelativePaths(html, isInSubdir) {
  if (!isInSubdir) return html;
  
  // Convert all relative paths to root-absolute for language subdirectories
  return html
    .replace(/href="(?!http|#|\/|mailto:)([^"]+)"/g, (match, originalPath) => {
      // Remove leading ../
      let cleanPath = originalPath.replace(/^\.\.\//, '');
      
      // If it's still a relative path (not starting with /), make it root-absolute
      if (!cleanPath.startsWith('/') && !cleanPath.startsWith('http') && cleanPath !== '#') {
        return `href="/${cleanPath}"`;
      }
      return match;
    })
    .replace(/src="(?!http|\/|data:)([^"]+)"/g, (match, originalPath) => {
      // Remove leading ../
      let cleanPath = originalPath.replace(/^\.\.\//, '');
      
      // If it's still a relative path (not starting with /), make it root-absolute
      if (!cleanPath.startsWith('/') && !cleanPath.startsWith('http') && !cleanPath.startsWith('data:')) {
        return `src="/${cleanPath}"`;
      }
      return match;
    });
}

function processPage(sourcePath, pagePath, lang) {
  const html = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Update language attribute
  document.documentElement.lang = lang.code;
  
  // Remove i18n-pending class
  document.documentElement.classList.remove('i18n-pending');
  
  // Translate all i18n-marked elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = translate(key, lang.code);
  });
  
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = translate(key, lang.code);
  });
  
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', translate(key, lang.code));
  });
  
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.getAttribute('data-i18n-alt');
    el.setAttribute('alt', translate(key, lang.code));
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', translate(key, lang.code));
  });
  
  document.querySelectorAll('[data-i18n-content]').forEach(el => {
    const key = el.getAttribute('data-i18n-content');
    el.setAttribute('content', translate(key, lang.code));
  });
  
  // Update navigation links to point to the correct language version
  if (lang.code !== 'en') {
    const urlLangCode = lang.urlCode || lang.code;
    
    document.querySelectorAll('a[href]').forEach(el => {
      const href = el.getAttribute('href');
      
      // Special handling for auth pages - always point to English versions
      const hrefBase = href.split('#')[0];
      const hash = href.includes('#') ? href.substring(href.indexOf('#')) : '';
      
      if (hrefBase === 'html/link.html' || hrefBase === 'html/link' || hrefBase === 'link.html' || hrefBase === 'link') {
        el.setAttribute('href', '/html/link' + hash);
        return;
      }
      if (hrefBase === 'html/profile.html' || hrefBase === 'html/profile' || hrefBase === 'profile.html' || hrefBase === 'profile') {
        el.setAttribute('href', '/html/profile' + hash);
        return;
      }
      
      if (href === 'index.html') {
        el.setAttribute('href', `/${urlLangCode}/`);
      } else if (href === '../index.html') {
        el.setAttribute('href', `/${urlLangCode}/`);
      } else if (href && href.startsWith('html/') && !href.includes('http')) {
        const localPath = href.replace('html/', '').replace('.html', '');
        el.setAttribute('href', `/${urlLangCode}/${localPath}`);
      } else if (href === 'games.html') {
        el.setAttribute('href', `/${urlLangCode}/games`);
      } else if (href === 'about.html') {
        el.setAttribute('href', `/${urlLangCode}/about`);
      } else if (href === 'contact.html') {
        el.setAttribute('href', `/${urlLangCode}/contact`);
      } else if (href === 'privacy.html') {
        el.setAttribute('href', `/${urlLangCode}/privacy`);
      } else if (href === 'privacy-wordsinacircle.html') {
        el.setAttribute('href', `/${urlLangCode}/privacy-wordsinacircle`);
      } else if (href === 'terms.html') {
        el.setAttribute('href', `/${urlLangCode}/terms`);
      } else if (href && href.startsWith('games/') && !href.includes('http')) {
        const localPath = href.replace('games/', '').replace('.html', '');
        el.setAttribute('href', `/${urlLangCode}/games/${localPath}`);
      }
    });
  }
  
  // Add canonical and hreflang links
  const head = document.querySelector('head');
  const canonicalUrl = getCanonicalUrl(pagePath, lang.code);
  
  // Add canonical
  const existingCanonical = head.querySelector('link[rel="canonical"]');
  if (existingCanonical) {
    existingCanonical.setAttribute('href', canonicalUrl);
  } else {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = canonicalUrl;
    head.insertBefore(canonical, head.querySelector('title'));
  }
  
  // Add hreflang links
  const hreflangContainer = document.createComment(' hreflang links ');
  head.insertBefore(hreflangContainer, head.querySelector('title'));
  
  const hreflangHTML = generateHreflangLinks(pagePath);
  const tempDiv = dom.window.document.createElement('div');
  tempDiv.innerHTML = hreflangHTML;
  
  for (const child of [...tempDiv.children]) {
    head.insertBefore(child, head.querySelector('title'));
  }
  
  // Get final HTML
  let finalHTML = dom.serialize();
  
  // Adjust relative paths
  // For English pages at root (except index.html from source root), convert ../ to /
  // For language subdirectories, convert all relative to root-absolute
  const isRootEnglishPage = lang.code === 'en' && pagePath !== '';
  if (lang.code !== 'en' || isRootEnglishPage) {
    finalHTML = adjustRelativePaths(finalHTML, true);
  }
  
  return finalHTML;
}

function generatePages() {
  console.log('Generating static multilingual pages...\n');
  
  const distDir = path.join(root, 'dist');
  
  // Generate pages for each language
  for (const page of PUBLIC_PAGES) {
    console.log(`Processing ${page.source}...`);
    
    for (const lang of LANGS) {
      const html = processPage(page.source, page.path, lang);
      
      let outputPath;
      if (lang.isDefault) {
        // English: place pages at root of dist/ for clean URLs
        if (page.path === '') {
          outputPath = path.join(distDir, 'index.html');
        } else if (page.path === 'games/battle-planes') {
          // Battle Planes stays in games/ subdirectory
          const gamesDir = path.join(distDir, 'games');
          if (!fs.existsSync(gamesDir)) {
            fs.mkdirSync(gamesDir, { recursive: true });
          }
          outputPath = path.join(gamesDir, 'battle-planes.html');
        } else {
          // Other pages go to root: /about.html, /contact.html, etc.
          outputPath = path.join(distDir, page.outputName);
        }
      } else {
        // Other languages in subdirectories
        const urlLangCode = lang.urlCode || lang.code;
        const langDir = path.join(distDir, urlLangCode);
        
        if (!fs.existsSync(langDir)) {
          fs.mkdirSync(langDir, { recursive: true });
        }
        
        if (page.path === '') {
          outputPath = path.join(langDir, 'index.html');
        } else if (page.path === 'games/battle-planes') {
          const gamesDir = path.join(langDir, 'games');
          if (!fs.existsSync(gamesDir)) {
            fs.mkdirSync(gamesDir, { recursive: true });
          }
          outputPath = path.join(gamesDir, 'battle-planes.html');
        } else {
          outputPath = path.join(langDir, page.outputName);
        }
      }
      
      fs.writeFileSync(outputPath, html, 'utf8');
      console.log(`  ✓ ${lang.code}: ${outputPath.replace(distDir + '/', '')}`);
    }
    console.log('');
  }
  
  // Copy English pages to /html/ for backward compatibility
  // These old URLs must return 200 (may be registered with app stores)
  console.log('Creating backward-compatible /html/ copies...');
  const htmlDir = path.join(distDir, 'html');
  const pagesForHtmlDir = ['about', 'contact', 'games', 'privacy', 'privacy-wordsinacircle', 'terms'];
  
  for (const pageName of pagesForHtmlDir) {
    const sourcePath = path.join(distDir, `${pageName}.html`);
    const targetPath = path.join(htmlDir, `${pageName}.html`);
    
    if (fs.existsSync(sourcePath)) {
      let html = fs.readFileSync(sourcePath, 'utf8');
      // The canonical already points to the clean root URL, which is correct
      fs.writeFileSync(targetPath, html, 'utf8');
      console.log(`  ✓ html/${pageName}.html (canonical points to /${pageName})`);
    }
  }
  
  // Add noindex to auth-callback, link, profile pages
  console.log('\nAdding noindex to auth pages...');
  for (const page of NOINDEX_PAGES) {
    const targetPath = path.join(distDir, page);
    if (fs.existsSync(targetPath)) {
      let html = fs.readFileSync(targetPath, 'utf8');
      if (!html.includes('robots')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
        fs.writeFileSync(targetPath, html, 'utf8');
        console.log(`  ✓ ${page}`);
      }
    }
  }
  
  console.log('\n✓ All pages generated successfully!');
}

if (require.main === module) {
  generatePages();
}

module.exports = { generatePages, PUBLIC_PAGES, LANGS, BASE_URL };
