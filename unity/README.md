# Unity: "Link to website" button

`Assets/DuctTapeGames/Accounts/WebLinkCodePanel.cs` asks the server for a one-time code that a player types on ducttapegames.com/html/link.html to open their game account in a browser.

## Setup

1. Copy `Assets/DuctTapeGames/` into the game project.
2. On the Settings screen, add a panel with:
   - a Button: "Link to website"
   - a TMP text for the code, styled large and spaced
   - a TMP text for status and the countdown
   - an optional Button: "Copy"
3. Add `WebLinkCodePanel` to the panel and drag those four in.
4. Set **Api Base** to the Supabase functions URL, for example `https://abcdefgh.supabase.co/functions/v1`. It's the same value as `apiBase` in the site's `config.js`.

## How it works

- The script needs the player to be logged into PlayFab already, as a guest or with Play Games. It sends `PlayFabSettings.staticPlayer.ClientSessionTicket` in the `X-Session-Ticket` header to `POST /link-code`.
- The server checks the ticket with PlayFab and returns `{ code: "K7QM-3XPA", expiresAt, expiresIn: 600 }`. Each new code cancels the previous unused one.
- The panel hides itself in WebGL builds, because those already run on the website.
- The link page tells players where to find the button: **Settings → Link to website**. If the panel goes somewhere else, update the steps in `link.html` to match.

---

# Unity: WebGL session handoff

In the browser build, the game does **not** log in by itself. The website owns the account (guest, Google or game code) and hands the PlayFab session to the game. Players keep one identity across the site and the game, and a guest who later saves with Google keeps their progress.

## Files

- `Assets/DuctTapeGames/Accounts/DTGWebBridge.cs`
- `Assets/DuctTapeGames/Accounts/Plugins/WebGL/DTGWebBridge.jslib`

## Setup

1. Add an empty GameObject to the first scene with `DTGWebBridge` on it. It renames itself to `DTGWebBridge`, which is the name the page uses to send it messages, and it stays loaded across scenes.
2. Where the game logs in today, branch on the build:
   ```csharp
   if (DTGWebBridge.IsWebHosted)
       DTGWebBridge.WhenSignedIn(session => OnLoggedIn(session.playFabId));
   else
       LoginAsBefore(); // guest custom ID / Play Games, unchanged
   ```
   The bridge has already set `PlayFabSettings.staticPlayer` (session ticket, PlayFab ID and entity token), so PlayFab API calls work as normal.
3. Subscribe to `DTGWebBridge.SessionChanged`:
   - When it passes `null`, the player signed out on the site. Return to the title screen.
   - When the `playFabId` changes, a different player signed in. Reload their data.
4. **Invite links.** `games.html?join=ABC123` arrives as `session.joinCode`. Use it to join that UGS lobby after login.
5. **Save button.** For guests in the browser build, add a "Save progress" button that calls `DTGWebBridge.Instance.RequestSaveProgress()`. The page asks before leaving the game for Google sign-in.
6. **Profile button.** `OpenProfile()` opens the website profile in a new tab.
7. **Build and host.** Make a WebGL build with Brotli or Gzip compression and upload it, for example to `webgl/` at the site root (next to `html/`).
   - Serve `.br` / `.gz` files with the matching `Content-Encoding` header.
   - Fill in `webgl` in the site's `config.js` with the four file paths.
