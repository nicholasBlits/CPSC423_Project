// Runs before paint. Hides the page only when a non-English language will be
// applied, so the English source does not flash. i18n.js removes the class.
(function () {
  var aliases = {
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

  function norm(value) {
    if (!value) return '';
    var lower = String(value).trim().replace(/_/g, '-').toLowerCase();
    if (aliases[lower]) return aliases[lower];
    return aliases[lower.split('-')[0]] || '';
  }

  var chosen = '';
  try {
    chosen = norm(new URLSearchParams(location.search).get('lang'));
    if (!chosen) chosen = norm(localStorage.getItem('dtg.lang'));
    if (!chosen) {
      var list = navigator.languages || [navigator.language || ''];
      for (var i = 0; i < list.length; i++) {
        chosen = norm(list[i]);
        if (chosen) break;
      }
    }
  } catch (error) {}

  if (chosen && chosen !== 'en') {
    document.documentElement.lang = chosen;
    document.documentElement.classList.add('i18n-pending');
    setTimeout(function () {
      document.documentElement.classList.remove('i18n-pending');
    }, 4000);
  }
})();

// Handle ?lang= query parameter: redirect to path-based URLs
// Only for clients (not crawlers), only on English root pages
(function() {
  // Don't redirect crawlers
  var ua = navigator.userAgent.toLowerCase();
  if (ua.indexOf('googlebot') !== -1 || ua.indexOf('bingbot') !== -1 || 
      ua.indexOf('yandex') !== -1 || ua.indexOf('baiduspider') !== -1 || 
      ua.indexOf('duckduckbot') !== -1 || ua.indexOf('slurp') !== -1) {
    return;
  }

  try {
    var url = new URL(window.location.href);
    var langParam = url.searchParams.get('lang');
    
    if (!langParam) return;
    
    // Only redirect if we're on an English root page (not already on a language path)
    var path = window.location.pathname;
    if (path.match(/^\/(zh-hans|zh-hant|ro|uk|ru)\//)) {
      return; // Already on a language path
    }
    
    // Map lang parameter to URL path
    var langMap = {
      'zh-hans': 'zh-hans',
      'zh-cn': 'zh-hans',
      'zh-sg': 'zh-hans',
      'zh': 'zh-hans',
      'zh-hant': 'zh-hant',
      'zh-tw': 'zh-hant',
      'zh-hk': 'zh-hant',
      'zh-mo': 'zh-hant',
      'ro': 'ro',
      'uk': 'uk',
      'ru': 'ru',
      'en': null
    };
    
    var normalized = langParam.toLowerCase().replace(/_/g, '-');
    var targetLang = langMap[normalized];
    
    if (!targetLang) {
      // Unknown or English - strip the param
      url.searchParams.delete('lang');
      if (url.search !== window.location.search) {
        window.location.replace(url.toString());
      }
      return;
    }
    
    // Build target URL
    var targetPath;
    
    if (path === '/' || path === '/index.html') {
      targetPath = '/' + targetLang + '/';
    } else if (path.indexOf('/html/') === 0) {
      var page = path.replace('/html/', '').replace('.html', '');
      targetPath = '/' + targetLang + '/' + page;
    } else if (path.indexOf('/games/') === 0) {
      targetPath = '/' + targetLang + path;
    } else {
      var page = path.replace(/^\//, '').replace('.html', '');
      if (page) {
        targetPath = '/' + targetLang + '/' + page;
      } else {
        targetPath = '/' + targetLang + '/';
      }
    }
    
    // Preserve hash but not the lang query param
    url.searchParams.delete('lang');
    var targetUrl = targetPath + (url.search || '') + (url.hash || '');
    window.location.replace(targetUrl);
  } catch (e) {
    // Ignore errors in older browsers
  }
})();
