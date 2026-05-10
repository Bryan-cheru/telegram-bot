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
      if (key && String(key).trim()) {
        localStorage.setItem(STORAGE_KEY, String(key).trim());
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
