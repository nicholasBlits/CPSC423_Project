#!/usr/bin/env node
/**
 * Generate sitemap.xml with hreflang alternates for all languages.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://ducttapegames.com';
const LANGS = [
  { code: 'en', urlCode: null },
  { code: 'zh-Hans', urlCode: 'zh-hans' },
  { code: 'zh-Hant', urlCode: 'zh-hant' },
  { code: 'ro', urlCode: 'ro' },
  { code: 'uk', urlCode: 'uk' },
  { code: 'ru', urlCode: 'ru' }
];

const PAGES = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  { path: 'about', priority: '0.8', changefreq: 'monthly' },
  { path: 'contact', priority: '0.7', changefreq: 'monthly' },
  { path: 'games', priority: '0.9', changefreq: 'weekly' },
  { path: 'games/battle-planes', priority: '0.9', changefreq: 'weekly' },
  { path: 'privacy', priority: '0.5', changefreq: 'yearly' },
  { path: 'privacy-wordsinacircle', priority: '0.5', changefreq: 'yearly' },
  { path: 'terms', priority: '0.5', changefreq: 'yearly' }
];

function getUrl(pagePath, langCode) {
  const lang = LANGS.find(l => l.code === langCode);
  const urlLangCode = lang?.urlCode;
  
  if (!pagePath) {
    return urlLangCode ? `${BASE_URL}/${urlLangCode}/` : `${BASE_URL}/`;
  }
  return urlLangCode ? `${BASE_URL}/${urlLangCode}/${pagePath}` : `${BASE_URL}/${pagePath}`;
}

function generateSitemap() {
  console.log('Generating sitemap.xml...\n');
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
  
  for (const page of PAGES) {
    for (const lang of LANGS) {
      const url = getUrl(page.path, lang.code);
      
      xml += '  <url>\n';
      xml += `    <loc>${url}</loc>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      
      // Add xhtml:link for all language alternates
      for (const altLang of LANGS) {
        const altUrl = getUrl(page.path, altLang.code);
        const hreflang = altLang.code === 'zh-Hans' ? 'zh-Hans' :
                        altLang.code === 'zh-Hant' ? 'zh-Hant' :
                        altLang.urlCode || altLang.code;
        xml += `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${altUrl}"/>\n`;
      }
      
      // Add x-default (English)
      const defaultUrl = getUrl(page.path, 'en');
      xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultUrl}"/>\n`;
      
      xml += '  </url>\n';
    }
  }
  
  xml += '</urlset>\n';
  
  const distDir = path.join(__dirname, '..', 'dist');
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  console.log(`✓ Sitemap generated: ${sitemapPath}`);
  console.log(`  Total URLs: ${PAGES.length * LANGS.length}`);
  
  return xml;
}

if (require.main === module) {
  generateSitemap();
}

module.exports = { generateSitemap };
