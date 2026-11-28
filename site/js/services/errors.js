/* Last-resort error handling: keeps a bounded in-memory log (nothing leaves
   the browser) and shows one calm banner instead of a silently broken page. */
window.Atlas = window.Atlas || {};
Atlas.errors = (function () {
  'use strict';
  var recent = [], shown = false, MAX = 20;

  function record(kind, err) {
    recent.push({ kind: kind, message: String((err && err.message) || err), at: new Date().toISOString() });
    if (recent.length > MAX) recent.shift();
    if (shown || !document.body) return;
    shown = true;
    var bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.id = 'errorBanner';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:10px 16px;background:#7f1d1d;color:#fff;font:14px/1.4 system-ui,sans-serif';
    bar.textContent = 'Something went wrong. Reload the page; if it persists, the data may be temporarily unavailable.';
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = 'Dismiss';
    close.style.cssText = 'margin-inline-start:12px;padding:2px 8px';
    close.addEventListener('click', function () { bar.remove(); });
    bar.appendChild(close);
    document.body.appendChild(bar);
  }
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window) return;   // resource load failures are handled where they occur
    record('error', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', function (e) { record('rejection', e.reason); });
  return { recent: function () { return recent.slice(); } };
})();
