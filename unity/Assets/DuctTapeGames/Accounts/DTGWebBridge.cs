using System;
using System.Runtime.InteropServices;
using PlayFab;
using PlayFab.AuthenticationModels;
using UnityEngine;

namespace DuctTapeGames.Accounts
{
    /// <summary>
    /// In the WebGL build, takes the player's PlayFab session from the website
    /// (games.html) instead of logging in, so the game and the site share one
    /// account, guests included. Also carries the lobby join code from an
    /// invite link (?join=ABC123). On other platforms it does nothing.
    ///
    /// Put it on a GameObject in the first scene. The page reaches it by name
    /// with SendMessage, so the GameObject is renamed to "DTGWebBridge".
    /// </summary>
    public class DTGWebBridge : MonoBehaviour
    {
        public static DTGWebBridge Instance { get; private set; }

        /// <summary>Raised when the site signs in, renews, switches or signs out (null).</summary>
        public static event Action<WebSession> SessionChanged;

        public WebSession Current { get; private set; }

#if UNITY_WEBGL && !UNITY_EDITOR
        public static bool IsWebHosted => true;
        [DllImport("__Internal")] static extern string DTG_GetWebSession();
        [DllImport("__Internal")] static extern void DTG_RequestAccountAction(string action);
#else
        public static bool IsWebHosted => false;
        static string DTG_GetWebSession() => "";
        static void DTG_RequestAccountAction(string action) { }
#endif

        bool ready;

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            gameObject.name = "DTGWebBridge";
            DontDestroyOnLoad(gameObject);
        }

        void Start()
        {
            if (IsWebHosted) Apply(DTG_GetWebSession());
        }

        /// <summary>
        /// Runs callback once the website session is in place. Use this instead
        /// of the game's own login when IsWebHosted is true.
        /// </summary>
        public static void WhenSignedIn(Action<WebSession> callback)
        {
            if (Instance != null && Instance.ready && Instance.Current != null)
            {
                callback(Instance.Current);
                return;
            }
            Action<WebSession> once = null;
            once = session =>
            {
                if (session == null) return;
                SessionChanged -= once;
                callback(session);
            };
            SessionChanged += once;
        }

        /// <summary>Asks the site to save this (guest) account with Google. Leaves the game.</summary>
        public void RequestSaveProgress() => DTG_RequestAccountAction("save");

        /// <summary>Opens the website profile in a new tab.</summary>
        public void OpenProfile() => DTG_RequestAccountAction("profile");

        // Called by the page (webgl.js) through SendMessage.
        public void OnWebSession(string json) => Apply(json);
        public void OnWebSignedOut(string _) => Apply("");

        void Apply(string json)
        {
            if (string.IsNullOrEmpty(json))
            {
                Current = null;
                ready = false;
                PlayFabSettings.staticPlayer.ForgetAllCredentials();
                SessionChanged?.Invoke(null);
                return;
            }

            WebSession session;
            try
            {
                session = JsonUtility.FromJson<WebSession>(json);
            }
            catch (ArgumentException)
            {
                Debug.LogError("[DTGWebBridge] The website sent a session the game could not read.");
                return;
            }
            if (session == null || string.IsNullOrEmpty(session.ticket) || string.IsNullOrEmpty(session.playFabId)) return;

            var switchedPlayer = Current != null && Current.playFabId != session.playFabId;
            if (switchedPlayer) PlayFabSettings.staticPlayer.ForgetAllCredentials();
            PlayFabSettings.staticPlayer.ClientSessionTicket = session.ticket;
            PlayFabSettings.staticPlayer.PlayFabId = session.playFabId;
            Current = session;

            // Entity APIs need an entity token; PlayFab issues one for a session ticket.
            PlayFabAuthenticationAPI.GetEntityToken(new GetEntityTokenRequest(), result =>
            {
                if (Current != session) return; // a newer session arrived meanwhile
                PlayFabSettings.staticPlayer.EntityToken = result.EntityToken;
                PlayFabSettings.staticPlayer.EntityId = result.Entity?.Id;
                PlayFabSettings.staticPlayer.EntityType = result.Entity?.Type;
                ready = true;
                SessionChanged?.Invoke(session);
            }, error =>
            {
                Debug.LogWarning($"[DTGWebBridge] Entity token failed: {error.GenerateErrorReport()}");
                ready = true; // Client API calls still work with the ticket
                SessionChanged?.Invoke(session);
            });
        }
    }

#pragma warning disable 0649 // filled by JsonUtility
    [Serializable]
    public class WebSession
    {
        public string ticket;
        public string playFabId;
        public string playerId;
        public string method;      // "guest", "google" or "device" (game code)
        public string displayName;
        public string joinCode;    // UGS lobby code from an invite link, or ""

        public bool IsGuest => method == "guest";
    }
#pragma warning restore 0649
}
