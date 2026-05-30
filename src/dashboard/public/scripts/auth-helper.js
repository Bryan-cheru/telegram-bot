/**
 * Injects x-api-key on all fetch() calls from localStorage (set in Settings).
 * Load this script before api.js and clean-dashboard.js.
 */
(function () {
  var STORAGE_KEY = 'telegram_dashboard_api_key';

  window.getDashboardApiKey = function () {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  };

  window.setDashboardApiKey = function (key) {
    try {
      var value = String(key || '').trim();
      // Strip "VARNAME=" prefix if user pasted the entire .env line (e.g. "DASHBOARD_API_KEY=abc123")
      var eqIdx = value.indexOf('=');
      if (eqIdx > 0 && /^[A-Z][A-Z0-9_]*$/.test(value.substring(0, eqIdx))) {
        value = value.substring(eqIdx + 1).trim();
      }
      if (value) {
        localStorage.setItem(STORAGE_KEY, value);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Could not persist API key:', e);
    }
  };

  /** EventSource cannot send headers — append api_key when key is stored */
  window.getLogsStreamUrl = function () {
    var base = '/api/logs/stream';
    var key = window.getDashboardApiKey();
    if (!key) return base;
    return base + '?api_key=' + encodeURIComponent(key);
  };

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    var key = window.getDashboardApiKey();
    if (!key) {
      return origFetch.call(window, input, init);
    }
    var headers = new Headers(init.headers || {});
    if (!headers.has('x-api-key')) {
      headers.set('x-api-key', key);
    }
    return origFetch.call(window, input, Object.assign({}, init, { headers: headers }));
  };
})();
