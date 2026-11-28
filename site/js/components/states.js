/* Shared UI state primitives: the loading indicator and the fatal-error panel
   shown when the data layer cannot start. Reused by any page. */
window.Atlas = window.Atlas || {};
Atlas.components = Atlas.components || {};

Atlas.components.states = (function () {
  'use strict';

  function setLoading(on) {
    var node = Atlas.util.qs('loading');
    if (node) node.hidden = !on;
  }

  function showError(container, err) {
    if (!container) return;
    container.innerHTML = '<div class="panel-inner"><h1>Could not load the data files</h1>' +
      '<p class="hint" id="errDetail"></p>' +
      '<p class="hint">This page needs the <code>data/</code> folder beside it. From a clone:</p>' +
      '<pre style="white-space:pre-wrap">./scripts/serve.sh</pre>' +
      '<p class="hint">For a deployment, build first and serve the result:</p>' +
      '<pre style="white-space:pre-wrap">./scripts/build-site.sh\npython3 -m http.server -d _site 8000</pre>' +
      '<p class="hint">Publishing <code>site/</code> on its own will not work, because the data lives outside it.</p></div>';
    var detail = container.querySelector('#errDetail');
    if (detail) detail.textContent = err && err.message ? err.message : String(err);
  }

  return { setLoading: setLoading, showError: showError };
})();
