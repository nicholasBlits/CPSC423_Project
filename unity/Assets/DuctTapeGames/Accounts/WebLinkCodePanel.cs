using System;
using System.Collections;
using System.Text;
using PlayFab;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace DuctTapeGames.Accounts
{
    /// <summary>
    /// "Link to website" button. Asks the DTG server for a one-time code the
    /// player types on ducttapegames.com/html/link.html to open this same account
    /// in a browser. Needs a PlayFab login first (guest or Play Games).
    /// </summary>
    public class WebLinkCodePanel : MonoBehaviour
    {
        [Header("Server")]
        [Tooltip("Supabase functions URL, e.g. https://abcdefgh.supabase.co/functions/v1")]
        [SerializeField] string apiBase = "";
        [SerializeField] string linkPageUrl = "ducttapegames.com/html/link.html";

        [Header("UI")]
        [SerializeField] Button linkButton;
        [SerializeField] TMP_Text codeText;
        [SerializeField] TMP_Text statusText;
        [SerializeField] Button copyButton;

        string code;
        float expiresAtRealtime;
        float copiedUntilRealtime;
        bool requesting;

        void Awake()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            // The browser build is already on the website.
            gameObject.SetActive(false);
#else
            linkButton.onClick.AddListener(RequestCode);
            if (copyButton != null) copyButton.onClick.AddListener(CopyCode);
            ShowCode(null);
            statusText.text = $"Play on the web with this account. Tap the button, then enter the code at {linkPageUrl}.";
#endif
        }

        void Update()
        {
            if (code == null || Time.realtimeSinceStartup < copiedUntilRealtime) return;
            var left = Mathf.CeilToInt(expiresAtRealtime - Time.realtimeSinceStartup);
            if (left <= 0)
            {
                ShowCode(null);
                statusText.text = "That code expired. Tap the button for a new one.";
                return;
            }
            statusText.text = $"Enter this at {linkPageUrl} within {left / 60}:{left % 60:00}. Never share it.";
        }

        public void RequestCode()
        {
            if (!requesting) StartCoroutine(FetchCode());
        }

        IEnumerator FetchCode()
        {
            var ticket = PlayFabSettings.staticPlayer?.ClientSessionTicket;
            if (string.IsNullOrEmpty(ticket))
            {
                statusText.text = "Sign in first, then try again.";
                yield break;
            }
            if (string.IsNullOrEmpty(apiBase))
            {
                Debug.LogError("[WebLinkCodePanel] Set apiBase in the inspector.");
                statusText.text = "Linking is not available right now.";
                yield break;
            }

            requesting = true;
            linkButton.interactable = false;
            statusText.text = "Getting your code…";

            using (var request = new UnityWebRequest(apiBase.TrimEnd('/') + "/link-code", UnityWebRequest.kHttpVerbPOST))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes("{}"));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("X-Session-Ticket", ticket);
                request.timeout = 15;
                yield return request.SendWebRequest();

                requesting = false;
                linkButton.interactable = true;

                if (request.result == UnityWebRequest.Result.Success)
                {
                    var reply = JsonUtility.FromJson<CodeReply>(request.downloadHandler.text);
                    expiresAtRealtime = Time.realtimeSinceStartup + reply.expiresIn;
                    ShowCode(reply.code);
                }
                else
                {
                    ShowCode(null);
                    statusText.text = ErrorText(request.responseCode);
                    Debug.LogWarning($"[WebLinkCodePanel] link-code failed: {request.responseCode} {request.error}");
                }
            }
        }

        static string ErrorText(long status)
        {
            switch (status)
            {
                case 0: return "Could not reach the server. Check your connection and try again.";
                case 401: return "Your session expired. Restart the game and try again.";
                case 403: return "This account cannot be linked right now. Contact support@ducttapegames.com.";
                default: return "Something went wrong. Please try again in a moment.";
            }
        }

        void ShowCode(string value)
        {
            code = value;
            codeText.text = value ?? "";
            codeText.gameObject.SetActive(value != null);
            if (copyButton != null) copyButton.gameObject.SetActive(value != null);
        }

        void CopyCode()
        {
            if (code == null) return;
            GUIUtility.systemCopyBuffer = code;
            statusText.text = "Code copied.";
            copiedUntilRealtime = Time.realtimeSinceStartup + 2f;
        }

#pragma warning disable 0649 // filled by JsonUtility
        [Serializable]
        class CodeReply
        {
            public string code;
            public string expiresAt;
            public int expiresIn;
        }
#pragma warning restore 0649
    }
}
