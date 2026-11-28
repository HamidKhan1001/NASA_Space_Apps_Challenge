/* Allow-list HTML sanitiser for rendered Markdown (methods page). Removes
   scripts, event handlers, unsafe URLs and anything outside the allow-list. */
window.Atlas = window.Atlas || {};
Atlas.sanitize = (function () {
  'use strict';
  var TAGS = 'a b blockquote br code dd del div dl dt em h1 h2 h3 h4 h5 h6 hr i li ol p pre span strong sub sup table tbody td tfoot th thead tr ul'.split(' ');
  var ATTRS = { a: ['href', 'title'], th: ['align'], td: ['align'], '*': ['id', 'class'] };
  var SAFE_URL = /^(https?:|mailto:|#|\.{0,2}\/|[A-Za-z0-9_-][^:]*$)/i;

  function clean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) { child.remove(); return; }
      var tag = child.tagName.toLowerCase();
      if (TAGS.indexOf(tag) === -1) {
        if (/^(script|style|iframe|object|embed|form|svg|math|link|meta|base)$/.test(tag)) { child.remove(); return; }
        clean(child);                       // unknown wrapper: keep its text, drop the tag
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove(); return;
      }
      Array.prototype.slice.call(child.attributes).forEach(function (a) {
        var ok = (ATTRS[tag] || []).concat(ATTRS['*']).indexOf(a.name) !== -1;
        if (ok && (a.name === 'href') && !SAFE_URL.test(a.value.trim())) ok = false;
        if (!ok) child.removeAttribute(a.name);
      });
      if (tag === 'a' && child.getAttribute('href') && /^https?:/i.test(child.getAttribute('href'))) {
        child.setAttribute('rel', 'noopener noreferrer'); child.setAttribute('target', '_blank');
      }
      clean(child);
    });
  }
  function html(dirty) {
    var doc = new DOMParser().parseFromString('<body>' + String(dirty) + '</body>', 'text/html');
    clean(doc.body);
    return doc.body.innerHTML;
  }
  return { html: html };
})();
