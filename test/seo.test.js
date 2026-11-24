const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const distDir = path.join(__dirname, '..', 'dist');
const BASE_URL = 'https://ducttapegames.com';

const LANGS = [
  { code: 'en', urlCode: null },
  { code: 'zh-Hans', urlCode: 'zh-hans' },
  { code: 'zh-Hant', urlCode: 'zh-hant' },
  { code: 'ro', urlCode: 'ro' },
  { code: 'uk', urlCode: 'uk' },
  { code: 'ru', urlCode: 'ru' }
];

const PUBLIC_PAGES = [
  { path: '', file: 'index.html' },
  { path: 'about', file: 'about.html' },
  { path: 'contact', file: 'contact.html' },
  { path: 'games', file: 'games.html' },
  { path: 'privacy', file: 'privacy.html' },
  { path: 'privacy-wordsinacircle', file: 'privacy-wordsinacircle.html' },
  { path: 'terms', file: 'terms.html' },
  { path: 'games/battle-planes', file: 'games/battle-planes.html' }
];

const NOINDEX_PAGES = [
  'html/auth-callback.html',
  'html/link.html',
  'html/profile.html'
];

function getDistPath(pagePath, langCode) {
  const lang = LANGS.find(l => l.code === langCode);
  const urlLangCode = lang?.urlCode;
  
  if (!urlLangCode) {
    // English: pages at root of dist/
    if (pagePath === '') return path.join(distDir, 'index.html');
    if (pagePath === 'games/battle-planes') {
      return path.join(distDir, 'games', 'battle-planes.html');
    }
    return path.join(distDir, `${pagePath}.html`);
  }
  
  // Other languages in subdirectories
  if (pagePath === '') return path.join(distDir, urlLangCode, 'index.html');
  if (pagePath === 'games/battle-planes') {
    return path.join(distDir, urlLangCode, 'games', 'battle-planes.html');
  }
  return path.join(distDir, urlLangCode, `${pagePath}.html`);
}

function getCanonicalUrl(pagePath, langCode) {
  const lang = LANGS.find(l => l.code === langCode);
  const urlLangCode = lang?.urlCode;
  
  if (!pagePath) {
    return urlLangCode ? `${BASE_URL}/${urlLangCode}/` : `${BASE_URL}/`;
  }
  return urlLangCode ? `${BASE_URL}/${urlLangCode}/${pagePath}` : `${BASE_URL}/${pagePath}`;
}

describe('sitemap.xml', () => {
  test('exists and is valid XML', () => {
    const sitemapPath = path.join(distDir, 'sitemap.xml');
    assert.ok(fs.existsSync(sitemapPath), 'sitemap.xml must exist');
    
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    assert.match(xml, /<urlset/, 'Must be valid sitemap XML');
    assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/, 'Must have sitemap namespace');
    assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/, 'Must have xhtml namespace for hreflang');
  });
  
  test('includes all public pages in all languages', () => {
    const sitemapPath = path.join(distDir, 'sitemap.xml');
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    
    for (const page of PUBLIC_PAGES) {
      for (const lang of LANGS) {
        const url = getCanonicalUrl(page.path, lang.code);
        assert.match(xml, new RegExp(`<loc>${url.replace(/\//g, '\\/')}</loc>`), 
          `Sitemap must include ${url}`);
      }
    }
  });
  
  test('includes hreflang alternates for each URL', () => {
    const sitemapPath = path.join(distDir, 'sitemap.xml');
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    
    // Check that hreflang links exist
    assert.match(xml, /hreflang="en"/, 'Must include English hreflang');
    assert.match(xml, /hreflang="zh-Hans"/, 'Must include zh-Hans hreflang');
    assert.match(xml, /hreflang="zh-Hant"/, 'Must include zh-Hant hreflang');
    assert.match(xml, /hreflang="ro"/, 'Must include Romanian hreflang');
    assert.match(xml, /hreflang="uk"/, 'Must include Ukrainian hreflang');
    assert.match(xml, /hreflang="ru"/, 'Must include Russian hreflang');
    assert.match(xml, /hreflang="x-default"/, 'Must include x-default hreflang');
  });
  
  test('does not include noindex pages', () => {
    const sitemapPath = path.join(distDir, 'sitemap.xml');
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    
    assert.doesNotMatch(xml, /auth-callback/, 'Must not include auth-callback');
    assert.doesNotMatch(xml, /\/link/, 'Must not include link page');
    assert.doesNotMatch(xml, /\/profile/, 'Must not include profile page');
    assert.doesNotMatch(xml, /\/join\//, 'Must not include join redirects');
  });
});

describe('robots.txt', () => {
  test('exists and includes sitemap', () => {
    const robotsPath = path.join(distDir, 'robots.txt');
    assert.ok(fs.existsSync(robotsPath), 'robots.txt must exist');
    
    const content = fs.readFileSync(robotsPath, 'utf8');
    assert.match(content, /Sitemap: https:\/\/ducttapegames\.com\/sitemap\.xml/, 
      'Must reference sitemap.xml');
    assert.match(content, /User-agent: \*/, 'Must have User-agent directive');
    assert.match(content, /Allow: \//, 'Must allow crawling');
  });
  
  test('disallows auth and dynamic pages', () => {
    const robotsPath = path.join(distDir, 'robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf8');
    
    assert.match(content, /Disallow: .*auth-callback/, 'Must disallow auth-callback');
    assert.match(content, /Disallow: .*\/link/, 'Must disallow link page');
    assert.match(content, /Disallow: .*\/profile/, 'Must disallow profile page');
  });
});

describe('IndexNow key', () => {
  test('key file exists at site root', () => {
    const keyPath = path.join(distDir, '4a9f2977851e259ad282de1b1950e1b2.txt');
    assert.ok(fs.existsSync(keyPath), 'IndexNow key file must exist');
    
    const content = fs.readFileSync(keyPath, 'utf8').trim();
    assert.strictEqual(content, '4a9f2977851e259ad282de1b1950e1b2', 
      'Key file must contain the exact key');
  });
});

describe('canonical tags', () => {
  for (const page of PUBLIC_PAGES) {
    for (const lang of LANGS) {
      test(`${lang.code} ${page.path || 'home'} has correct canonical`, () => {
        const filePath = getDistPath(page.path, lang.code);
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        
        const html = fs.readFileSync(filePath, 'utf8');
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const canonical = document.querySelector('link[rel="canonical"]');
        assert.ok(canonical, `${filePath} must have canonical link`);
        
        const expectedUrl = getCanonicalUrl(page.path, lang.code);
        assert.strictEqual(canonical.href, expectedUrl, 
          `Canonical URL must be ${expectedUrl}`);
      });
    }
  }
});

describe('hreflang tags', () => {
  for (const page of PUBLIC_PAGES) {
    for (const lang of LANGS) {
      test(`${lang.code} ${page.path || 'home'} has complete hreflang set`, () => {
        const filePath = getDistPath(page.path, lang.code);
        const html = fs.readFileSync(filePath, 'utf8');
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const hreflangLinks = [...document.querySelectorAll('link[rel="alternate"][hreflang]')];
        assert.ok(hreflangLinks.length >= LANGS.length + 1, 
          `Must have at least ${LANGS.length + 1} hreflang links (including x-default)`);
        
        // Check for each language
        for (const targetLang of LANGS) {
          const hreflang = targetLang.code === 'zh-Hans' ? 'zh-Hans' :
                          targetLang.code === 'zh-Hant' ? 'zh-Hant' :
                          targetLang.urlCode || targetLang.code;
          const expectedUrl = getCanonicalUrl(page.path, targetLang.code);
          
          const link = hreflangLinks.find(l => l.getAttribute('hreflang') === hreflang);
          assert.ok(link, `Must have hreflang="${hreflang}"`);
          assert.strictEqual(link.href, expectedUrl, 
            `hreflang ${hreflang} must point to ${expectedUrl}`);
        }
        
        // Check x-default
        const xDefault = hreflangLinks.find(l => l.getAttribute('hreflang') === 'x-default');
        assert.ok(xDefault, 'Must have x-default hreflang');
        assert.strictEqual(xDefault.href, getCanonicalUrl(page.path, 'en'), 
          'x-default must point to English version');
      });
    }
  }
});

describe('language attributes', () => {
  for (const page of PUBLIC_PAGES) {
    for (const lang of LANGS) {
      test(`${lang.code} ${page.path || 'home'} has correct lang attribute`, () => {
        const filePath = getDistPath(page.path, lang.code);
        const html = fs.readFileSync(filePath, 'utf8');
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        assert.strictEqual(document.documentElement.lang, lang.code, 
          `<html> must have lang="${lang.code}"`);
      });
    }
  }
});

describe('noindex pages', () => {
  for (const page of NOINDEX_PAGES) {
    test(`${page} has noindex meta tag`, () => {
      const filePath = path.join(distDir, page);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const html = fs.readFileSync(filePath, 'utf8');
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const robotsMeta = document.querySelector('meta[name="robots"]');
      assert.ok(robotsMeta, `${page} must have robots meta tag`);
      assert.match(robotsMeta.content, /noindex/, `${page} must have noindex`);
    });
  }
});

describe('translated content', () => {
  const english = require('../JS/i18n-catalog.js').en;
  const locales = {
    'zh-Hans': require('../JS/locales/zh-Hans.js'),
    'zh-Hant': require('../JS/locales/zh-Hant.js'),
    ro: require('../JS/locales/ro.js'),
    uk: require('../JS/locales/uk.js'),
    ru: require('../JS/locales/ru.js')
  };
  
  test('game titles are correct in all languages', () => {
    const titles = {
      'zh-Hans': '炸飞机 Battle Planes：在线对战',
      'zh-Hant': '炸飛機 Battle Planes：線上對戰',
      ro: 'Battle Planes Multiplayer',
      uk: 'Літаки на папері: онлайн',
      ru: 'Самолёты на бумаге: онлайн'
    };
    
    for (const [code, expected] of Object.entries(titles)) {
      const bag = locales[code];
      const actual = bag['footer.privacyBp'];
      assert.ok(actual.includes(expected) || actual.includes('Battle Planes'), 
        `${code} must use correct game title`);
    }
    
    // Verify zh-Hans doesn't use 打飞机
    const zhHans = locales['zh-Hans'];
    for (const [key, value] of Object.entries(zhHans)) {
      assert.ok(!String(value).includes('打飞机'), 
        `${key} must not contain 打飞机`);
    }
  });
  
  test('non-English pages contain translated text in HTML', () => {
    for (const lang of LANGS) {
      if (lang.code === 'en') continue;
      
      const filePath = getDistPath('', lang.code);
      const html = fs.readFileSync(filePath, 'utf8');
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Check that navigation is translated
      const homeLink = document.querySelector('[href*="index.html"], a[href="/"], a[href*="/' + (lang.urlCode || lang.code) + '/"]');
      if (homeLink) {
        const text = homeLink.textContent.trim();
        assert.notStrictEqual(text, 'Home', 
          `${lang.code} home page must have translated navigation (not "Home")`);
      }
      
      // Check title is translated
      const title = document.querySelector('title');
      if (title) {
        const titleText = title.textContent;
        const expectedKey = 'meta.home.title';
        const translated = locales[lang.code][expectedKey];
        if (translated) {
          assert.ok(titleText.includes(translated.split('—')[0].trim()) || 
                   titleText !== english[expectedKey],
            `${lang.code} title must be translated`);
        }
      }
    }
  });
});

describe('Cloudflare Web Analytics', () => {
  test('analytics beacon appears exactly once per page', () => {
    for (const page of PUBLIC_PAGES) {
      for (const lang of LANGS) {
        const filePath = getDistPath(page.path, lang.code);
        const html = fs.readFileSync(filePath, 'utf8');
        
        const matches = html.match(/cloudflareinsights\.com\/beacon\.min\.js/g);
        assert.ok(matches, `${filePath} must include Cloudflare Web Analytics`);
        assert.strictEqual(matches.length, 1, 
          `${filePath} must include analytics beacon exactly once (found ${matches.length})`);
      }
    }
  });
});

describe('_redirects validation', () => {
  test('contains no query string rules in source paths', () => {
    const redirectsPath = path.join(__dirname, '..', '_redirects');
    const content = fs.readFileSync(redirectsPath, 'utf8');
    
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const source = parts[0];
        assert.ok(!source.includes('?'), 
          `_redirects source path must not contain query strings (Cloudflare Workers can't match them): ${line}`);
      }
    }
  });
  
  test('contains no duplicate source paths', () => {
    const redirectsPath = path.join(__dirname, '..', '_redirects');
    const content = fs.readFileSync(redirectsPath, 'utf8');
    
    const sources = new Set();
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const source = parts[0];
        assert.ok(!sources.has(source), 
          `Duplicate rule for path ${source} in _redirects`);
        sources.add(source);
      }
    }
  });
  
  test('join code redirect is valid', () => {
    const redirectsPath = path.join(__dirname, '..', '_redirects');
    const content = fs.readFileSync(redirectsPath, 'utf8');
    
    assert.match(content, /\/join\/:code/, 
      '_redirects must have join code redirect');
  });
  
  test('contains no problematic 200 rewrites', () => {
    const redirectsPath = path.join(__dirname, '..', '_redirects');
    const content = fs.readFileSync(redirectsPath, 'utf8');
    
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3 && parts[2] === '200') {
        const source = parts[0];
        const target = parts[1];
        
        // Check for infinite loop patterns: /path -> /path.html or /path/ -> /path
        const targetWithoutExt = target.replace(/\.html$/, '');
        const sourceWithoutSlash = source.replace(/\/$/, '');
        
        assert.ok(targetWithoutExt !== source && targetWithoutExt !== sourceWithoutSlash,
          `200 rewrite creates infinite loop with html_handling: ${line}`);
      }
    }
  });
});

describe('URL resolution', () => {
  test('all sitemap URLs resolve to real files', () => {
    const sitemapPath = path.join(distDir, 'sitemap.xml');
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    
    // Extract all <loc> URLs
    const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    const urls = [...locMatches].map(m => m[1]);
    
    for (const url of urls) {
      const urlPath = url.replace(BASE_URL, '');
      
      // Map URL to file path (with Cloudflare html_handling rules)
      let filePath;
      if (urlPath === '/' || urlPath === '') {
        filePath = path.join(distDir, 'index.html');
      } else if (urlPath.endsWith('/')) {
        // Directory URL: /zh-hans/ -> zh-hans/index.html
        filePath = path.join(distDir, urlPath.slice(1), 'index.html');
      } else {
        // Clean URL: /about -> about.html, /zh-hans/about -> zh-hans/about.html
        filePath = path.join(distDir, urlPath.slice(1) + '.html');
      }
      
      assert.ok(fs.existsSync(filePath), 
        `Sitemap URL ${url} must resolve to existing file ${filePath}`);
    }
  });
  
  test('all canonical URLs resolve to real files', () => {
    for (const page of PUBLIC_PAGES) {
      for (const lang of LANGS) {
        const filePath = getDistPath(page.path, lang.code);
        const html = fs.readFileSync(filePath, 'utf8');
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
          const url = canonical.href;
          const urlPath = url.replace(BASE_URL, '');
          
          let expectedFilePath;
          if (urlPath === '/' || urlPath === '') {
            expectedFilePath = path.join(distDir, 'index.html');
          } else if (urlPath.endsWith('/')) {
            expectedFilePath = path.join(distDir, urlPath.slice(1), 'index.html');
          } else {
            expectedFilePath = path.join(distDir, urlPath.slice(1) + '.html');
          }
          
          assert.ok(fs.existsSync(expectedFilePath), 
            `Canonical URL ${url} in ${filePath} must resolve to ${expectedFilePath}`);
        }
      }
    }
  });
  
  test('all hreflang URLs resolve to real files', () => {
    for (const page of PUBLIC_PAGES) {
      for (const lang of LANGS) {
        const filePath = getDistPath(page.path, lang.code);
        
        // Check source file exists
        if (!fs.existsSync(filePath)) {
          throw new Error(`Source file does not exist: ${filePath}`);
        }
        
        const html = fs.readFileSync(filePath, 'utf8');
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const hreflangLinks = document.querySelectorAll('link[rel="alternate"][hreflang]');
        for (const link of hreflangLinks) {
          const url = link.href;
          const urlPath = url.replace(BASE_URL, '');
          
          let expectedFilePath;
          if (urlPath === '/' || urlPath === '') {
            expectedFilePath = path.join(distDir, 'index.html');
          } else if (urlPath.endsWith('/')) {
            expectedFilePath = path.join(distDir, urlPath.slice(1), 'index.html');
          } else {
            expectedFilePath = path.join(distDir, urlPath.slice(1) + '.html');
          }
          
          assert.ok(fs.existsSync(expectedFilePath), 
            `Hreflang URL ${url} (${link.getAttribute('hreflang')}) in ${filePath} must resolve to ${expectedFilePath}`);
        }
      }
    }
  });
  
  test('all asset paths in generated pages are valid', () => {
    for (const page of PUBLIC_PAGES) {
      for (const lang of LANGS) {
        const filePath = getDistPath(page.path, lang.code);
        
        // Check file exists before reading
        if (!fs.existsSync(filePath)) {
          throw new Error(`File does not exist: ${filePath}`);
        }
        
        const html = fs.readFileSync(filePath, 'utf8');
        
        // Check for broken relative paths (../something)
        const brokenPaths = [];
        if (html.includes('href="../JS/')) brokenPaths.push('href="../JS/');
        if (html.includes('src="../JS/')) brokenPaths.push('src="../JS/');
        if (html.includes('href="../css/')) brokenPaths.push('href="../css/');
        if (html.includes('src="../css/')) brokenPaths.push('src="../css/');
        if (html.includes('href="../DTG')) brokenPaths.push('href="../DTG');
        if (html.includes('src="../DTG')) brokenPaths.push('src="../DTG');
        
        assert.strictEqual(brokenPaths.length, 0, 
          `${filePath} has broken relative paths: ${brokenPaths.join(', ')}`);
        
        // Non-English pages should use root-absolute paths for assets
        if (lang.code !== 'en') {
          assert.ok(html.includes('href="/JS/') || html.includes('src="/JS/'), 
            `${filePath} should use root-absolute /JS/ paths`);
          assert.ok(html.includes('href="/css/') || html.includes('src="/css/'), 
            `${filePath} should use root-absolute /css/ paths`);
        }
      }
    }
  });
  
  test('all internal links resolve to real files', () => {
    const allHtmlFiles = [];
    
    // Collect all HTML files in dist
    function findHtmlFiles(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findHtmlFiles(fullPath);
        } else if (entry.name.endsWith('.html')) {
          allHtmlFiles.push(fullPath);
        }
      }
    }
    
    findHtmlFiles(distDir);
    
    for (const htmlFile of allHtmlFiles) {
      const html = fs.readFileSync(htmlFile, 'utf8');
      const dom = new JSDOM(html, { url: 'https://ducttapegames.com/' });
      const document = dom.window.document;
      
      // Check all href attributes (only for HTML pages, not assets)
      document.querySelectorAll('[href]').forEach(el => {
        const href = el.getAttribute('href');
        
        // Skip external, mailto, hash-only, and data URIs
        if (!href || href.startsWith('http') || href.startsWith('mailto:') || 
            href.startsWith('#') || href.startsWith('data:') || href.startsWith('javascript:')) {
          return;
        }
        
        // Skip non-HTML assets (images, fonts, etc.)
        const cleanHref = href.split('?')[0].split('#')[0];
        if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|pdf|zip)$/i.test(cleanHref)) {
          // For assets, just check they exist as-is
          let assetPath;
          if (cleanHref.startsWith('/')) {
            assetPath = path.join(distDir, decodeURIComponent(cleanHref.slice(1)));
          } else {
            assetPath = path.resolve(path.dirname(htmlFile), decodeURIComponent(cleanHref));
          }
          
          if (!fs.existsSync(assetPath)) {
            throw new Error(
              `Broken asset link in ${htmlFile.replace(distDir + '/', '')}: ` +
              `href="${href}" resolves to ${assetPath.replace(distDir + '/', '')} which does not exist`
            );
          }
          return;
        }
        
        // Resolve to file path (for HTML pages)
        let targetPath;
        const relativeTo = path.dirname(htmlFile);
        
        if (cleanHref.startsWith('/')) {
          // Root-absolute path
          if (cleanHref === '/' || cleanHref === '') {
            targetPath = path.join(distDir, 'index.html');
          } else if (cleanHref.endsWith('.html')) {
            targetPath = path.join(distDir, cleanHref.slice(1));
          } else if (cleanHref.endsWith('/')) {
            targetPath = path.join(distDir, cleanHref.slice(1), 'index.html');
          } else {
            // Clean URL: try .html
            targetPath = path.join(distDir, cleanHref.slice(1) + '.html');
          }
        } else {
          // Relative path
          const resolved = path.resolve(relativeTo, cleanHref);
          
          if (cleanHref.endsWith('.html')) {
            targetPath = resolved;
          } else if (cleanHref === 'index.html' || cleanHref === '../index.html') {
            targetPath = resolved;
          } else {
            // Try as-is first, then with .html
            if (fs.existsSync(resolved)) {
              targetPath = resolved;
            } else {
              targetPath = resolved + '.html';
            }
          }
        }
        
        if (!fs.existsSync(targetPath)) {
          // For clean URLs, also check if directory with index.html exists
          const dirIndexPath = path.join(targetPath.replace(/\.html$/, ''), 'index.html');
          if (!fs.existsSync(dirIndexPath)) {
            throw new Error(
              `Broken link in ${htmlFile.replace(distDir + '/', '')}: ` +
              `href="${href}" resolves to ${targetPath.replace(distDir + '/', '')} which does not exist`
            );
          }
        }
      });
      
      // Check all src attributes
      document.querySelectorAll('[src]').forEach(el => {
        const src = el.getAttribute('src');
        
        // Skip external, data URIs
        if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('//')) {
          return;
        }
        
        let targetPath;
        const relativeTo = path.dirname(htmlFile);
        
        if (src.startsWith('/')) {
          targetPath = path.join(distDir, decodeURIComponent(src.slice(1)));
        } else {
          targetPath = path.resolve(relativeTo, decodeURIComponent(src));
        }
        
        if (!fs.existsSync(targetPath)) {
          throw new Error(
            `Broken src in ${htmlFile.replace(distDir + '/', '')}: ` +
            `src="${src}" resolves to ${targetPath.replace(distDir + '/', '')} which does not exist`
          );
        }
      });
    }
  });
  
  test('backward-compatible /html/ URLs exist', () => {
    const htmlPages = ['about', 'contact', 'games', 'privacy', 'privacy-wordsinacircle', 'terms'];
    
    for (const page of htmlPages) {
      const filePath = path.join(distDir, 'html', `${page}.html`);
      assert.ok(fs.existsSync(filePath), 
        `/html/${page}.html must exist for backward compatibility`);
      
      // Verify it has a canonical pointing to the clean root URL
      const html = fs.readFileSync(filePath, 'utf8');
      const expectedCanonical = `https://ducttapegames.com/${page}`;
      assert.ok(html.includes(`rel="canonical" href="${expectedCanonical}"`),
        `/html/${page}.html must have canonical pointing to /${page}`);
    }
  });
});
