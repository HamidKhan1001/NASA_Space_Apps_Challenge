/* HTTP client: the only place that calls fetch. Adds what a static site can
   enforce on its own: a request budget (rate limit), bounded concurrency,
   timeouts, retry with backoff (honouring Retry-After on 429/503), in-flight
   de-duplication and path validation. Pure logic, so it also loads in Node for tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Atlas = root.Atlas || {}; root.Atlas.http = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RETRY_STATUS = { 408: 1, 425: 1, 429: 1, 500: 1, 502: 1, 503: 1, 504: 1 };

  function HttpError(message, status, url) {
    var e = new Error(message); e.name = 'HttpError'; e.status = status; e.url = url; return e;
  }
  function RateLimitError(message, url, retryAfterMs) {
    var e = HttpError(message, 429, url); e.name = 'RateLimitError'; e.retryAfterMs = retryAfterMs; return e;
  }
  function TimeoutError(url, ms) {
    var e = new Error('Timed out after ' + ms + ' ms: ' + url); e.name = 'TimeoutError'; e.url = url; return e;
  }

  // Ids and relative paths come from the URL hash and the data files; refuse
  // anything that could leave the data root or point at another origin.
  var SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  function isSafeId(id) { return typeof id === 'string' && id.length <= 64 && SAFE_SEGMENT.test(id) && id.indexOf('..') === -1; }
  function isSafePath(path) {
    if (typeof path !== 'string' || !path || path.length > 200) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.charAt(0) === '/' || path.indexOf('\\') !== -1) return false;
    return path.split('/').every(function (seg) { return SAFE_SEGMENT.test(seg) && seg.indexOf('..') === -1; });
  }

  function parseRetryAfter(value, nowMs) {
    if (value == null || value === '') return null;
    var secs = Number(value);
    if (isFinite(secs)) return Math.max(0, secs * 1000);
    var at = Date.parse(value);
    return isNaN(at) ? null : Math.max(0, at - nowMs);
  }

  function createClient(opts) {
    opts = opts || {};
    var doFetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(typeof self !== 'undefined' ? self : globalThis) : null);
    var now = opts.now || Date.now;
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var cfg = {
      maxConcurrent: opts.maxConcurrent || 6,
      ratePerSec: opts.ratePerSec || 20,   // sustained request budget
      burst: opts.burst || 10,             // bucket size
      retries: opts.retries == null ? 3 : opts.retries,
      baseDelayMs: opts.baseDelayMs || 300,
      maxDelayMs: opts.maxDelayMs || 8000,
      timeoutMs: opts.timeoutMs || 15000,
      random: opts.random || Math.random
    };

    var tokens = cfg.burst, lastRefill = now();
    var active = 0, waiting = [];
    var inflight = {};

    function refill() {
      var t = now();
      tokens = Math.min(cfg.burst, tokens + ((t - lastRefill) / 1000) * cfg.ratePerSec);
      lastRefill = t;
    }
    function acquire() {
      return new Promise(function (resolve) { waiting.push(resolve); pump(); });
    }
    function pump() {
      while (waiting.length && active < cfg.maxConcurrent) {
        refill();
        if (tokens < 1) {
          var wait = Math.ceil(((1 - tokens) / cfg.ratePerSec) * 1000);
          sleep(wait).then(pump);
          return;
        }
        tokens -= 1; active += 1;
        waiting.shift()();
      }
    }
    function release() { active -= 1; pump(); }

    function once(url, init) {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer, timedOut = false;
      var guard = new Promise(function (_, reject) {
        timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); reject(TimeoutError(url, cfg.timeoutMs)); }, cfg.timeoutMs);
      });
      var req = doFetch(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
      return Promise.race([req, guard]).then(
        function (r) { clearTimeout(timer); return r; },
        function (e) { clearTimeout(timer); throw timedOut ? TimeoutError(url, cfg.timeoutMs) : e; }
      );
    }

    function request(url, init) {
      function attempt(n) {
        return acquire().then(function () {
          return once(url, init).then(function (res) { release(); return res; }, function (e) { release(); throw e; });
        }).then(function (res) {
          if (res.ok) return res;
          var retryable = RETRY_STATUS[res.status] === 1;
          if (!retryable || n >= cfg.retries) {
            if (res.status === 429) throw RateLimitError('Rate limited (429): ' + url, url, parseRetryAfter(res.headers && res.headers.get('Retry-After'), now()));
            throw HttpError(res.status + ' ' + url, res.status, url);
          }
          var hinted = parseRetryAfter(res.headers && res.headers.get('Retry-After'), now());
          return backoff(n, hinted).then(function () { return attempt(n + 1); });
        }, function (e) {
          if (n >= cfg.retries) throw e;
          return backoff(n, null).then(function () { return attempt(n + 1); });
        });
      }
      return attempt(0);
    }

    // Exponential backoff with full jitter; a server hint wins but stays capped.
    function backoff(n, hintedMs) {
      var exp = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(2, n));
      var delay = hintedMs != null ? Math.min(cfg.maxDelayMs, hintedMs) : Math.round(exp / 2 + cfg.random() * exp / 2);
      return sleep(delay);
    }

    // De-duplicated GET: concurrent callers for the same URL share one request.
    function getJSON(url, init) {
      var key = 'J ' + url;
      if (!inflight[key]) inflight[key] = request(url, init).then(function (r) { return r.json(); })
        .then(function (v) { delete inflight[key]; return v; }, function (e) { delete inflight[key]; throw e; });
      return inflight[key];
    }
    function getText(url, init) {
      var key = 'T ' + url;
      if (!inflight[key]) inflight[key] = request(url, init).then(function (r) { return r.text(); })
        .then(function (v) { delete inflight[key]; return v; }, function (e) { delete inflight[key]; throw e; });
      return inflight[key];
    }

    return { request: request, getJSON: getJSON, getText: getText, stats: function () { return { active: active, queued: waiting.length, tokens: tokens }; } };
  }

  return { createClient: createClient, isSafeId: isSafeId, isSafePath: isSafePath, parseRetryAfter: parseRetryAfter,
           HttpError: HttpError, RateLimitError: RateLimitError, TimeoutError: TimeoutError };
});
