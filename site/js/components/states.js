/* Shared UI state primitives: the loading indicator and the fatal-error panel
   shown when the data layer cannot start. Reused by any page. */
window.Atlas = window.Atlas || {};
Atlas.components = Atlas.components || {};

Atlas.components.states = (function () {
  'use strict';
  var el = Atlas.util.el;

  function setLoading(on) {
    var node = Atlas.util.qs('loading');
    if (node) node.hidden = !on;
  }

  function showError(node, err) {
    if (!node) return;
    node.innerHTML = '';
    node.appendChild(el('h2', { text: 'Could not load data' }));
    node.appendChild(el('p', { 'class': 'muted', text: err && err.message ? err.message : String(err) }));
    node.appendChild(el('p', {
      html: 'Check that <code>data/meta.json</code> is served next to this page (see README: scripts/serve.sh).'
    }));
  }

  return { setLoading: setLoading, showError: showError };
})();
