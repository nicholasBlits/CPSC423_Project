const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// List of all public HTML files that should have the Cloudflare Web Analytics beacon
const PUBLIC_HTML_FILES = [
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
  'games/battle-planes.html',
];

// The expected beacon script (exact match)
const BEACON_SCRIPT = `<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "bf609eb13e294b0da394cadd308b025e"}'></script><!-- End Cloudflare Web Analytics -->`;

describe('Cloudflare Web Analytics beacon', () => {
  PUBLIC_HTML_FILES.forEach((filePath) => {
    test(`${filePath} contains the beacon exactly once`, () => {
      const fullPath = path.join(__dirname, '..', filePath);
      assert.ok(fs.existsSync(fullPath), `File ${filePath} should exist`);
      
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Count occurrences of the beacon
      const beaconCount = (content.match(/cloudflareinsights\.com\/beacon\.min\.js/g) || []).length;
      assert.strictEqual(beaconCount, 1, `${filePath} should contain the beacon exactly once, but found ${beaconCount} occurrence(s)`);
      
      // Verify the beacon is in the correct format
      assert.ok(content.includes(BEACON_SCRIPT), `${filePath} should contain the beacon in the exact expected format`);
      
      // Verify the beacon is before </body>
      const bodyEndIndex = content.indexOf('</body>');
      const beaconIndex = content.indexOf('cloudflareinsights.com/beacon.min.js');
      assert.ok(bodyEndIndex > beaconIndex, `${filePath}: beacon should appear before </body>`);
    });
  });

  test('No WebGL template files contain the beacon', () => {
    // Check that webgl/ and TemplateData/ directories don't contain .html files with the beacon
    // (These directories don't exist in this project, but this test documents the exclusion)
    const webglPaths = [
      path.join(__dirname, '..', 'webgl'),
      path.join(__dirname, '..', 'TemplateData'),
    ];
    
    webglPaths.forEach((dirPath) => {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath, { recursive: true });
        const htmlFiles = files.filter(f => f.endsWith('.html'));
        
        htmlFiles.forEach((file) => {
          const fullPath = path.join(dirPath, file);
          const content = fs.readFileSync(fullPath, 'utf8');
          const hasBeacon = content.includes('cloudflareinsights.com/beacon.min.js');
          assert.ok(!hasBeacon, `WebGL template ${file} should NOT contain the Cloudflare beacon`);
        });
      }
    });
  });
});
