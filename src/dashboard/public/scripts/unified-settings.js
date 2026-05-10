/**
 * Phase 3 — unified settings UI (GET /api/settings, PATCH /api/settings)
 */
(function () {
  var notifyFn = function (msg, type) {
    console.log(type + ':', msg);
  };

  var BOOLEAN_KEYS = new Set([
    'BOT_ENABLED',
    'DASHBOARD_ENABLED',
    'ALLOW_FORWARDED_MESSAGES',
    'USE_SIGNAL_STOPS',
    'USE_SMART_ORDER_TYPE',
    'ENABLE_ADVANCED_ORDER_TYPES',
    'ENFORCE_1_1_RR',
    'WEB_API_ENABLED'
  ]);

  /** Empty env means “on” for these (matches typical .env defaults) */
  var BOOLEAN_DEFAULT_TRUE = new Set([
    'BOT_ENABLED',
    'DASHBOARD_ENABLED',
    'USE_SMART_ORDER_TYPE',
    'ENABLE_ADVANCED_ORDER_TYPES',
    'ENFORCE_1_1_RR'
  ]);

  var ORDER_TYPE_OPTIONS = ['MARKET', 'LIMIT', 'AUTO'];
  var LOG_LEVEL_OPTIONS = ['error', 'warn', 'info', 'debug'];

  var GROUP_DEFS = [
    {
      title: 'Bot & Telegram',
      keys: [
        'BOT_ENABLED',
        'BOT_TOKEN',
        'ALLOWED_CHANNEL_ID',
        'ALLOWED_CHANNEL_USERNAME',
        'ALLOW_FORWARDED_MESSAGES'
      ]
    },
    {
      title: 'MetaAPI',
      keys: ['METAAPI_TOKEN', 'METAAPI_ACCOUNTS', 'METAAPI_ACCOUNT_ID']
    },
    {
      title: 'Risk & sizing',
      keys: [
        'FIXED_LOT_SIZE',
        'FIXED_RISK_AMOUNT',
        'RISK_REWARD_RATIO',
        'RISK_PERCENTAGE',
        'RISK_AMOUNT_USD',
        'MAX_TRADE_SIZE',
        'USE_SIGNAL_STOPS'
      ]
    },
    {
      title: 'Safety limits',
      keys: ['MAX_DAILY_LOSS_PERCENT', 'MAX_DRAWDOWN_PERCENT', 'MAX_DAILY_TRADES']
    },
    {
      title: 'Orders',
      keys: [
        'DEFAULT_ORDER_TYPE',
        'USE_SMART_ORDER_TYPE',
        'LIMIT_ORDER_SLIPPAGE',
        'PENDING_ORDER_EXPIRATION',
        'ENABLE_ADVANCED_ORDER_TYPES',
        'ENFORCE_1_1_RR',
        'CRYPTO_LOT_SIZE'
      ]
    },
    {
      title: 'Dashboard & server',
      keys: [
        'DASHBOARD_ENABLED',
        'DASHBOARD_PORT',
        'PORT',
        'DASHBOARD_API_KEY',
        'DASHBOARD_POLLING_INTERVAL',
        'WEB_API_ENABLED',
        'LOG_LEVEL'
      ]
    },
    {
      title: 'Performance & workers',
      keys: [
        'CHECK_INTERVAL_SECONDS',
        'NODE_OPTIONS',
        'UV_THREADPOOL_SIZE',
        'MAX_CONCURRENT_CONNECTIONS',
        'CONNECTION_POOL_SIZE',
        'OCR_WORKER_THREADS'
      ]
    },
    {
      title: 'Security',
      keys: ['JWT_SECRET']
    }
  ];

  function envBoolValue(str) {
    if (!str) return false;
    var t = String(str).toLowerCase();
    return t === '1' || t === 'true' || t === 'yes';
  }

  function groupPayload(settingsArr) {
    var byKey = new Map(settingsArr.map(function (s) { return [s.key, s]; }));
    var used = new Set();
    var groups = [];
    GROUP_DEFS.forEach(function (def) {
      var rows = [];
      def.keys.forEach(function (k) {
        if (byKey.has(k)) {
          rows.push(byKey.get(k));
          used.add(k);
        }
      });
      if (rows.length) groups.push({ title: def.title, rows: rows });
    });
    var rest = settingsArr.filter(function (s) { return !used.has(s.key); });
    if (rest.length) groups.push({ title: 'Other', rows: rest });
    return groups;
  }

  function renderInput(meta) {
    var key = meta.key;
    var orig = meta.value || '';
    var id = 'uset-' + key.replace(/[^a-zA-Z0-9]/g, '_');

    if (BOOLEAN_KEYS.has(key)) {
      var checked =
        orig === '' && BOOLEAN_DEFAULT_TRUE.has(key) ? true : envBoolValue(orig);
      var canonOrig = checked ? 'true' : 'false';
      return (
        '<label class="switch unified-setting-switch">' +
        '<input type="checkbox" id="' +
        id +
        '" data-setting-key="' +
        key +
        '" data-original="' +
        canonOrig +
        '" class="unified-setting-input" ' +
        (checked ? 'checked' : '') +
        ' />' +
        '<span class="slider"></span>' +
        '</label>'
      );
    }

    if (key === 'DEFAULT_ORDER_TYPE') {
      var opts = ORDER_TYPE_OPTIONS.map(function (o) {
        return (
          '<option value="' +
          o +
          '"' +
          (orig === o ? ' selected' : '') +
          '>' +
          o +
          '</option>'
        );
      }).join('');
      return (
        '<select id="' +
        id +
        '" data-setting-key="' +
        key +
        '" data-original="' +
        escapeAttr(orig) +
        '" class="form-input unified-setting-input">' +
        opts +
        '</select>'
      );
    }

    if (key === 'LOG_LEVEL') {
      var lo = LOG_LEVEL_OPTIONS.map(function (o) {
        return (
          '<option value="' +
          o +
          '"' +
          (orig === o ? ' selected' : '') +
          '>' +
          o +
          '</option>'
        );
      }).join('');
      return (
        '<select id="' +
        id +
        '" data-setting-key="' +
        key +
        '" data-original="' +
        escapeAttr(orig) +
        '" class="form-input unified-setting-input">' +
        lo +
        '</select>'
      );
    }

    if (key === 'NODE_OPTIONS' || key === 'METAAPI_ACCOUNTS') {
      return (
        '<textarea id="' +
        id +
        '" data-setting-key="' +
        key +
        '" data-original="' +
        escapeAttr(orig) +
        '" class="form-input unified-setting-input" rows="3" spellcheck="false">' +
        escapeHtml(orig) +
        '</textarea>'
      );
    }

    if (meta.secret) {
      return (
        '<input type="password" id="' +
        id +
        '" data-setting-key="' +
        key +
        '" data-original="" data-secret="1" data-masked="' +
        escapeAttr(meta.masked || '') +
        '" class="form-input unified-setting-input" placeholder="Leave blank to keep (' +
        escapeAttr(meta.masked || 'unset') +
        ')" autocomplete="off" />'
      );
    }

    return (
      '<input type="text" id="' +
      id +
      '" data-setting-key="' +
      key +
      '" data-original="' +
      escapeAttr(orig) +
      '" class="form-input unified-setting-input" value="' +
      escapeAttr(orig) +
      '" spellcheck="false" />'
    );
  }

  function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function render(rootEl, payload) {
    if (!payload || !payload.settings || !payload.settings.length) {
      rootEl.innerHTML =
        '<p class="text-muted">No settings returned. Check API key and server logs.</p>';
      return;
    }

    var groups = groupPayload(payload.settings);
    var html =
      '<div class="unified-settings-meta">' +
      '<span class="pill">File: <code>' +
      escapeHtml(payload.persistedFile || 'data/settings.json') +
      '</code></span>' +
      '</div>';

    groups.forEach(function (g) {
      html += '<div class="unified-settings-group">';
      html += '<h4 class="unified-settings-group-title">' + escapeHtml(g.title) + '</h4>';
      html += '<div class="unified-settings-rows">';
      g.rows.forEach(function (meta) {
        var restart = meta.restartHint
          ? '<span class="restart-badge" title="Changing this often needs a restart">restart</span>'
          : '';
        html += '<div class="unified-setting-row" data-setting-key="' + escapeAttr(meta.key) + '">';
        html +=
          '<div class="unified-setting-label"><code>' +
          escapeHtml(meta.key) +
          '</code>' +
          restart +
          (meta.secret ? ' <span class="secret-badge">secret</span>' : '') +
          '</div>';
        html += '<div class="unified-setting-control">' + renderInput(meta) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    });

    rootEl.innerHTML = html;
  }

  function collectPatch(rootEl) {
    var patch = {};
    var inputs = rootEl.querySelectorAll('.unified-setting-input');
    inputs.forEach(function (el) {
      var key = el.getAttribute('data-setting-key');
      if (!key) return;

      if (el.getAttribute('data-secret') === '1') {
        var pv = el.value.trim();
        if (!pv) return;
        patch[key] = pv;
        return;
      }

      if (el.type === 'checkbox') {
        var want = el.checked ? 'true' : 'false';
        var orig = el.getAttribute('data-original') || 'false';
        if (want !== orig) patch[key] = want;
        return;
      }

      var orig = el.getAttribute('data-original') || '';
      var nv = el.value.trim();
      if (nv !== orig) patch[key] = nv;
    });
    return patch;
  }

  async function refresh(rootEl) {
    rootEl.innerHTML =
      '<div class="unified-settings-loading"><i class="fas fa-spinner fa-spin"></i> Loading settings…</div>';
    try {
      var res = await fetch('/api/settings');
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      render(rootEl, data);
    } catch (e) {
      rootEl.innerHTML =
        '<div class="error-state"><i class="fas fa-exclamation-triangle"></i> ' +
        escapeHtml(e.message || String(e)) +
        '</div>';
      notifyFn('Failed to load settings: ' + e.message, 'error');
    }
  }

  async function save(rootEl) {
    var patch = collectPatch(rootEl);
    var keys = Object.keys(patch);
    if (!keys.length) {
      notifyFn('No changes to save.', 'info');
      return;
    }
    try {
      var res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      var data = await res.json();
      if (!res.ok) throw new Error((data.errors && data.errors.join('; ')) || data.error || res.statusText);
      notifyFn('Saved ' + keys.length + ' setting(s). Persisted to data/settings.json.', 'success');
      await refresh(rootEl);
      if (typeof window.loadRuntimeSettingsFormsHook === 'function') {
        window.loadRuntimeSettingsFormsHook();
      }
    } catch (e) {
      notifyFn('Save failed: ' + e.message, 'error');
    }
  }

  window.UnifiedSettingsPanel = {
    init: function (opts) {
      notifyFn = (opts && opts.notify) || notifyFn;
      var root = document.getElementById('unified-settings-root');
      if (!root) return;
      var btnR = document.getElementById('unified-settings-refresh');
      var btnS = document.getElementById('unified-settings-save');
      if (btnR) btnR.addEventListener('click', function () { refresh(root); });
      if (btnS) btnS.addEventListener('click', function () { save(root); });
    },
    refresh: function () {
      var root = document.getElementById('unified-settings-root');
      if (root) return refresh(root);
    },
    save: function () {
      var root = document.getElementById('unified-settings-root');
      if (root) return save(root);
    }
  };
})();
