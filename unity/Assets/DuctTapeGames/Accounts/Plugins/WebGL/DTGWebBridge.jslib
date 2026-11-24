// Lets the WebGL build read the website's session (window.DTGWebGL, set up
// by webgl.js on games.html) and ask the page for account actions.
mergeInto(LibraryManager.library, {
  DTG_GetWebSession: function () {
    var json = (typeof window !== 'undefined' && window.DTGWebGL && window.DTGWebGL.getSession()) || '';
    var size = lengthBytesUTF8(json) + 1;
    var buffer = _malloc(size);
    stringToUTF8(json, buffer, size);
    return buffer; // Unity frees it after copying into a C# string
  },

  DTG_RequestAccountAction: function (action) {
    if (typeof window !== 'undefined' && window.DTGWebGL) window.DTGWebGL.requestAccountAction(UTF8ToString(action));
  }
});