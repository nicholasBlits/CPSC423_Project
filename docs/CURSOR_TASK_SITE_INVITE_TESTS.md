# Cursor task: tests for invite links on ducttapegames.com (repo ggofthejungle/ducttapegames-site)

Paste to Cursor as-is. Branch off main, open a PR, don't merge.

Add automated tests (Node's built-in `node:test` or Vitest, whichever fits package.json best; add an `npm test` script) for the invite-link code merged in PR #9:

1. **Join-code parsing.** Move the duplicated join-code parsing in `JS/webgl.js` and the inline script in `games/battle-planes.html` into one small shared module (e.g. `JS/joincode.js`, exported for tests and attached to `window` for the pages), then test it:
   - `?join=ab12cd` -> `AB12CD`; `#join=Q9W8E7` -> `Q9W8E7`; path `/join/XYZ123` -> `XYZ123`
   - Codes are 4–12 letters/digits; `?join=AB`, `?join=!!!!!!`, `?join=` -> no code
   - Bug to fix: a plain hash like `#play` or `#ABCD` must NOT be read as a code (today `location.hash.replace('#join=', '')` accepts any 4–12 char hash).
2. **`_redirects`:** a test that reads the file and asserts the rule `/join/:code /games/battle-planes?join=:code 302` exists, with nothing else catching `/join/*` first.
3. **assetlinks.json:** valid JSON; package `com.ducttapegames.battleplanes`; relation `delegate_permission/common.handle_all_urls`; exactly these two SHA-256 fingerprints:
   - `54:62:4F:61:87:3A:BF:75:B9:88:34:0E:55:4E:1B:CE:F5:AF:C0:03:70:6B:93:21:D2:A4:D8:FB:E3:41:C2:FE`
   - `9F:C3:69:C3:BF:7D:A4:F4:35:F3:53:BC:E4:4F:EC:35:E1:E4:B2:E0:97:37:D0:C1:E9:21:C5:64:EB:73:1F:2A`
4. **`_headers`:** `/.well-known/assetlinks.json` is served as `application/json`.
5. **Build:** after `npm run build`, `dist/.well-known/assetlinks.json`, `dist/_redirects`, `dist/_headers` and `dist/games/battle-planes.html` exist.
6. **Session payload:** `payload()` in `JS/webgl.js` includes `joinCode` (empty string when there's none) next to ticket / playFabId / method / displayName. The Unity game (DTGWebBridge) reads exactly these field names. Don't rename them.

Keep the page behaviour the same apart from the hash fix. No new runtime dependencies.
