const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Load the join code parser
const { parseJoinCode } = require('../JS/joincode.js');

describe('Join code parsing', () => {
  test('parses query parameter with lowercase', () => {
    const result = parseJoinCode('?join=ab12cd', '', '/games/battle-planes');
    assert.strictEqual(result, 'AB12CD');
  });

  test('parses hash with join= prefix', () => {
    const result = parseJoinCode('', '#join=Q9W8E7', '/games/battle-planes');
    assert.strictEqual(result, 'Q9W8E7');
  });

  test('parses path pattern', () => {
    const result = parseJoinCode('', '', '/join/XYZ123');
    assert.strictEqual(result, 'XYZ123');
  });

  test('rejects code shorter than 4 characters', () => {
    const result = parseJoinCode('?join=AB', '', '/');
    assert.strictEqual(result, null);
  });

  test('rejects code with special characters', () => {
    const result = parseJoinCode('?join=!!!!!!', '', '/');
    assert.strictEqual(result, null);
  });

  test('rejects empty join parameter', () => {
    const result = parseJoinCode('?join=', '', '/');
    assert.strictEqual(result, null);
  });

  test('does NOT parse plain hash without join= prefix (#play)', () => {
    const result = parseJoinCode('', '#play', '/games/battle-planes');
    assert.strictEqual(result, null);
  });

  test('does NOT parse plain hash without join= prefix (#ABCD)', () => {
    const result = parseJoinCode('', '#ABCD', '/games/battle-planes');
    assert.strictEqual(result, null);
  });

  test('accepts valid 4-character code', () => {
    const result = parseJoinCode('?join=A1B2', '', '/');
    assert.strictEqual(result, 'A1B2');
  });

  test('accepts valid 12-character code', () => {
    const result = parseJoinCode('?join=ABC123XYZ789', '', '/');
    assert.strictEqual(result, 'ABC123XYZ789');
  });

  test('rejects code longer than 12 characters', () => {
    const result = parseJoinCode('?join=ABCD1234EFGH5', '', '/');
    assert.strictEqual(result, null);
  });

  test('query parameter takes precedence over hash', () => {
    const result = parseJoinCode('?join=QUERY1', '#join=HASH2', '/');
    assert.strictEqual(result, 'QUERY1');
  });

  test('hash takes precedence over path', () => {
    const result = parseJoinCode('', '#join=HASH2', '/join/PATH3');
    assert.strictEqual(result, 'HASH2');
  });
});

describe('Landing page error handling', () => {
  test('landing page has invalid-code-message element', () => {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    assert.ok(htmlContent.includes('id="invalid-code-message"'), 
      'HTML should contain invalid-code-message element');
    assert.ok(htmlContent.includes("That invite code doesn't look right"),
      'Invalid code message should have the correct text');
  });
  
  test('landing page has join-code-display element', () => {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    assert.ok(htmlContent.includes('id="join-code-display"'), 
      'HTML should contain join-code-display element');
    assert.ok(htmlContent.includes('id="join-code-value"'),
      'HTML should contain join-code-value element');
  });
  
  test('script handles valid code case', () => {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Check that the script shows code display for valid codes
    assert.ok(htmlContent.includes('if (joinCode)'), 
      'Script should check for valid joinCode');
    assert.ok(htmlContent.includes("codeDisplay.style.display = 'block'"),
      'Script should show code display for valid codes');
  });
  
  test('script handles invalid code case', () => {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Check that the script handles invalid codes
    assert.ok(htmlContent.includes('else if (hasJoinValue)'), 
      'Script should check for invalid join values');
    assert.ok(htmlContent.includes("invalidCodeMessage.style.display = 'block'"),
      'Script should show error message for invalid codes');
  });
  
  test('hasJoinValue detection logic', () => {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Check that hasJoinValue checks query, hash, and path
    assert.ok(htmlContent.includes("params.has('join')"),
      'hasJoinValue should check query parameter');
    assert.ok(htmlContent.includes("location.hash.startsWith('#join=')"),
      'hasJoinValue should check hash');
    assert.ok(htmlContent.includes("location.pathname.match(/\\/join\\//"),
      'hasJoinValue should check path pattern');
  });
});

describe('Steam launch button', () => {
  const { JSDOM } = require('jsdom');
  
  async function createPageDOM(url, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36') {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const joincodePath = path.join(__dirname, '../JS/joincode.js');
    const joincodeContent = fs.readFileSync(joincodePath, 'utf8');
    
    // Inline the joincode.js script into the HTML
    const modifiedHtml = htmlContent.replace(
      '<script src="../JS/joincode.js"></script>',
      `<script>${joincodeContent}</script>`
    );
    
    const dom = new JSDOM(modifiedHtml, {
      url: url,
      runScripts: 'dangerously',
      resources: 'usable',
      userAgent: userAgent,
      beforeParse(window) {
        // Override navigator.userAgent with configurable property
        Object.defineProperty(window.navigator, 'userAgent', {
          get: () => userAgent,
          configurable: true
        });
      }
    });
    
    // Wait for DOMContentLoaded and scripts to execute
    await new Promise(resolve => {
      if (dom.window.document.readyState === 'complete') {
        setTimeout(resolve, 200);
      } else {
        dom.window.document.addEventListener('DOMContentLoaded', () => {
          setTimeout(resolve, 200);
        });
      }
    });
    
    return dom;
  }
  
  test('desktop UA with valid code CMMHFT shows button with correct href', async () => {
    const dom = await createPageDOM('https://ducttapegames.com/games/battle-planes?join=CMMHFT');
    
    const button = dom.window.document.getElementById('steam-launch-button');
    const note = dom.window.document.getElementById('steam-launch-note');
    const invalidMessage = dom.window.document.getElementById('invalid-code-message');
    
    assert.ok(button, 'Steam launch button should exist');
    assert.notStrictEqual(button.style.display, 'none', 'Button should be visible');
    assert.strictEqual(button.href, 'steam://run/5641290//+bp_join%20CMMHFT', 
      'Button href should be exactly steam://run/5641290//+bp_join%20CMMHFT');
    assert.strictEqual(note.style.display, 'block', 'Note should be visible');
    assert.notStrictEqual(invalidMessage.style.display, 'block', 'Invalid message should be hidden');
    
    dom.window.close();
  });
  
  test('desktop UA with invalid code hides button and shows error', async () => {
    const dom = await createPageDOM('https://ducttapegames.com/games/battle-planes?join=%21%21');
    
    const button = dom.window.document.getElementById('steam-launch-button');
    const note = dom.window.document.getElementById('steam-launch-note');
    const invalidMessage = dom.window.document.getElementById('invalid-code-message');
    
    assert.ok(button, 'Steam launch button should exist');
    assert.strictEqual(button.style.display, 'none', 'Button should be hidden for invalid code');
    assert.notStrictEqual(note.style.display, 'block', 'Note should be hidden');
    assert.strictEqual(invalidMessage.style.display, 'block', 'Invalid message should be visible');
    
    dom.window.close();
  });
  
  test('desktop UA with no code hides button, note and error', async () => {
    const dom = await createPageDOM('https://ducttapegames.com/games/battle-planes');
    
    const button = dom.window.document.getElementById('steam-launch-button');
    const note = dom.window.document.getElementById('steam-launch-note');
    const invalidMessage = dom.window.document.getElementById('invalid-code-message');
    
    assert.ok(button, 'Steam launch button should exist');
    assert.strictEqual(button.style.display, 'none', 'Button should be hidden with no code');
    assert.notStrictEqual(note.style.display, 'block', 'Note should be hidden');
    assert.notStrictEqual(invalidMessage.style.display, 'block', 'Invalid message should be hidden');
    
    dom.window.close();
  });
  
  test('Android UA with valid code hides button', async () => {
    const dom = await createPageDOM(
      'https://ducttapegames.com/games/battle-planes?join=CMMHFT',
      'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
    );
    
    const button = dom.window.document.getElementById('steam-launch-button');
    const note = dom.window.document.getElementById('steam-launch-note');
    
    assert.ok(button, 'Steam launch button should exist');
    // On Android, the button script shouldn't run, so it stays at the initial display:none or empty
    const displayValue = button.style.display;
    assert.ok(displayValue === 'none' || displayValue === '', 
      `Button should be hidden on Android (display was "${displayValue}")`);
    // Actually check computed style to see if it's truly hidden
    const computedDisplay = dom.window.getComputedStyle(button).display;
    assert.ok(computedDisplay === 'none' || displayValue === 'none',
      'Button should have display:none on Android');
    assert.notStrictEqual(note.style.display, 'block', 'Note should be hidden on Android');
    
    dom.window.close();
  });
  
  test('landing page has required Steam button elements', () => {
    const htmlPath = path.join(__dirname, '../games/battle-planes.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    assert.ok(htmlContent.includes('id="steam-launch-button"'), 
      'HTML should contain steam-launch-button element');
    assert.ok(htmlContent.includes('id="steam-launch-note"'),
      'HTML should contain steam-launch-note element');
    assert.ok(htmlContent.includes('Needs the Battle Planes demo installed in Steam'),
      'Note should mention demo requirement');
  });
});

describe('_redirects file', () => {
  test('exists', () => {
    const redirectsPath = path.join(__dirname, '../_redirects');
    assert.ok(fs.existsSync(redirectsPath), '_redirects file should exist');
  });

  test('contains correct join redirect rule', () => {
    const redirectsPath = path.join(__dirname, '../_redirects');
    const content = fs.readFileSync(redirectsPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    
    // Find the /join/:code rule
    const joinRule = lines.find(line => line.includes('/join/'));
    assert.ok(joinRule, 'Should have a /join/ redirect rule');
    assert.match(joinRule, /^\/join\/:code\s+\/games\/battle-planes\?join=:code\s+302/, 
      'Rule should match: /join/:code /games/battle-planes?join=:code 302');
  });

  test('no other rules catch /join/* before the join rule', () => {
    const redirectsPath = path.join(__dirname, '../_redirects');
    const content = fs.readFileSync(redirectsPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    
    let foundJoinRule = false;
    for (const line of lines) {
      if (line.includes('/join/:code')) {
        foundJoinRule = true;
        break;
      }
      // Check if any earlier rule would catch /join/*
      if (line.match(/^\/join[\/\s]/)) {
        assert.fail('Found a /join/ rule before the main join rule');
      }
    }
    assert.ok(foundJoinRule, 'Should have found the join rule');
  });
});

describe('assetlinks.json', () => {
  const assetlinksPath = path.join(__dirname, '../.well-known/assetlinks.json');
  let assetlinks;

  test('exists and is valid JSON', () => {
    assert.ok(fs.existsSync(assetlinksPath), 'assetlinks.json should exist');
    const content = fs.readFileSync(assetlinksPath, 'utf8');
    assetlinks = JSON.parse(content); // Will throw if invalid JSON
    assert.ok(Array.isArray(assetlinks), 'Should be an array');
  });

  test('has correct package name', () => {
    const assetlinksContent = fs.readFileSync(assetlinksPath, 'utf8');
    assetlinks = JSON.parse(assetlinksContent);
    const entry = assetlinks[0];
    assert.strictEqual(entry.target.package_name, 'com.ducttapegames.battleplanes');
  });

  test('has correct relation', () => {
    const assetlinksContent = fs.readFileSync(assetlinksPath, 'utf8');
    assetlinks = JSON.parse(assetlinksContent);
    const entry = assetlinks[0];
    assert.ok(Array.isArray(entry.relation), 'relation should be an array');
    assert.ok(entry.relation.includes('delegate_permission/common.handle_all_urls'),
      'Should include delegate_permission/common.handle_all_urls');
  });

  test('has exactly two SHA-256 fingerprints', () => {
    const assetlinksContent = fs.readFileSync(assetlinksPath, 'utf8');
    assetlinks = JSON.parse(assetlinksContent);
    const entry = assetlinks[0];
    const fingerprints = entry.target.sha256_cert_fingerprints;
    assert.ok(Array.isArray(fingerprints), 'fingerprints should be an array');
    assert.strictEqual(fingerprints.length, 2, 'Should have exactly 2 fingerprints');
  });

  test('has correct SHA-256 fingerprints', () => {
    const assetlinksContent = fs.readFileSync(assetlinksPath, 'utf8');
    assetlinks = JSON.parse(assetlinksContent);
    const entry = assetlinks[0];
    const fingerprints = entry.target.sha256_cert_fingerprints;
    
    const expected = [
      '54:62:4F:61:87:3A:BF:75:B9:88:34:0E:55:4E:1B:CE:F5:AF:C0:03:70:6B:93:21:D2:A4:D8:FB:E3:41:C2:FE',
      '9F:C3:69:C3:BF:7D:A4:F4:35:F3:53:BC:E4:4F:EC:35:E1:E4:B2:E0:97:37:D0:C1:E9:21:C5:64:EB:73:1F:2A'
    ];
    
    assert.deepStrictEqual(fingerprints.sort(), expected.sort(), 
      'Should have the exact expected fingerprints');
  });
});

describe('_headers file', () => {
  test('exists', () => {
    const headersPath = path.join(__dirname, '../_headers');
    assert.ok(fs.existsSync(headersPath), '_headers file should exist');
  });

  test('configures assetlinks.json as application/json', () => {
    const headersPath = path.join(__dirname, '../_headers');
    const content = fs.readFileSync(headersPath, 'utf8');
    
    // Check if it has the path and Content-Type
    assert.match(content, /\/.well-known\/assetlinks\.json/, 
      'Should reference /.well-known/assetlinks.json');
    assert.match(content, /Content-Type:\s*application\/json/, 
      'Should set Content-Type: application/json');
  });
});

describe('Build output', () => {
  const { execSync } = require('child_process');
  
  test('npm run build creates required files in dist/', () => {
    // Run the build once at the start (other tests depend on dist/)
    // This test runs first (00- prefix) so dist/ is ready for seo.test.js
    execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    
    // Check that required files exist
    const distPath = path.join(__dirname, '../dist');
    
    assert.ok(fs.existsSync(path.join(distPath, '.well-known/assetlinks.json')),
      'dist/.well-known/assetlinks.json should exist');
    
    assert.ok(fs.existsSync(path.join(distPath, '_redirects')),
      'dist/_redirects should exist');
    
    assert.ok(fs.existsSync(path.join(distPath, '_headers')),
      'dist/_headers should exist');
    
    assert.ok(fs.existsSync(path.join(distPath, 'games/battle-planes.html')),
      'dist/games/battle-planes.html should exist');
    
    assert.ok(fs.existsSync(path.join(distPath, '404.html')),
      'dist/404.html should exist');
    
    assert.ok(fs.existsSync(path.join(distPath, 'webgl/Build')),
      'dist/webgl/Build should exist');
    
    // Check that webgl build files exist
    const webglBuild = path.join(distPath, 'webgl/Build');
    const buildFiles = fs.readdirSync(webglBuild);
    assert.ok(buildFiles.some(f => f.endsWith('.loader.js')),
      'dist/webgl/Build should contain loader.js');
    assert.ok(buildFiles.some(f => f.endsWith('.data.unityweb')),
      'dist/webgl/Build should contain data.unityweb');
    assert.ok(buildFiles.some(f => f.endsWith('.wasm.unityweb')),
      'dist/webgl/Build should contain wasm.unityweb');
    assert.ok(buildFiles.some(f => f.endsWith('.framework.js.unityweb')),
      'dist/webgl/Build should contain framework.js.unityweb');
  });
});

describe('Session payload in webgl.js', () => {
  test('payload function includes joinCode field', () => {
    const webglPath = path.join(__dirname, '../JS/webgl.js');
    const content = fs.readFileSync(webglPath, 'utf8');
    
    // Check that payload() includes joinCode
    assert.match(content, /joinCode:\s*joinCode\s*\|\|\s*['"]['"]/, 
      'payload() should include joinCode field with empty string fallback');
  });

  test('payload function includes all required fields', () => {
    const webglPath = path.join(__dirname, '../JS/webgl.js');
    const content = fs.readFileSync(webglPath, 'utf8');
    
    const requiredFields = ['ticket', 'playFabId', 'method', 'displayName', 'joinCode'];
    
    for (const field of requiredFields) {
      assert.match(content, new RegExp(`${field}:`), 
        `payload() should include ${field} field`);
    }
  });
  
  test('DTGWebGL.getSession exposes method field alongside DTG_LOGIN flow', () => {
    const webglPath = path.join(__dirname, '../JS/webgl.js');
    const content = fs.readFileSync(webglPath, 'utf8');
    
    // Check that DTGWebGL.getSession is defined
    assert.match(content, /window\.DTGWebGL\s*=\s*{/, 
      'window.DTGWebGL should be defined');
    assert.match(content, /getSession:\s*payload/, 
      'DTGWebGL.getSession should be set to payload function');
    
    // Check that DTG_LOGIN flow exists
    assert.match(content, /window\.DTG_LOGIN/, 
      'window.DTG_LOGIN should be used in the login flow');
    assert.match(content, /loginFor/, 
      'loginFor function should exist');
    assert.match(content, /sendLogin/, 
      'sendLogin function should exist');
    
    // Check that method field is in payload
    assert.match(content, /method:\s*session\.method/, 
      'payload should include session.method so game can read it via getSession()');
  });
});
