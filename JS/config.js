// Public settings for the account layer. Everything here ships to browsers,
// so never put a PlayFab secret key or a Google client secret in this file.
window.DTG_CONFIG = {
  // PlayFab Game Manager → title → Settings (gear) → Title settings → API Features → Title ID
  playfabTitleId: 'E1BA8',
  // Google Cloud Console → APIs & Services → Credentials → OAuth client (Web application) → Client ID
  googleClientId: '524219297367-al1106p0tb1vn7g87fr4ej34f63hn0r0.apps.googleusercontent.com',
  // PlayFab Game Manager → Add-ons → OpenID Connect → the Connection ID you created for Google
  googleConnectionId: 'google',
  // Optional. Defaults to html/auth-callback.html on this site; must match
  // an "Authorized redirect URI" on the Google OAuth client exactly.
  googleRedirectUri: '',
  // Supabase → Project Settings → API → URL, plus /functions/v1
  // e.g. https://abcdefgh.supabase.co/functions/v1
  apiBase: 'https://idwfbrjbbqugpzvvlzep.supabase.co/functions/v1',
  // Unity WebGL build (null until it is hosted). Paths are from Unity's Build
  // folder; serve .br/.gz files with the matching Content-Encoding header.
  webgl: {
    // Battle Planes 7.42 (sitelogin build: DTG_LOGIN + invite links)
    loaderUrl: '../webgl/Build/eb5cff27291bbe85080bd8560722f8be.loader.js',
    dataUrl: '../webgl/Build/1b7e544724becc9ff9173f11b85d4936.data.unityweb',
    frameworkUrl: '../webgl/Build/4bb7104468bbf8a3e4e6dfd4b5cdeb4a.framework.js.unityweb',
    codeUrl: '../webgl/Build/b969dea6ea761a700a5f577966480a3c.wasm.unityweb',
    streamingAssetsUrl: '../webgl/StreamingAssets',
    productVersion: '7.42'
  },
};
