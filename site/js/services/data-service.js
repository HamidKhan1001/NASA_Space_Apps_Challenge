/* Data service: the only module that knows data/ URLs, caching and the offline
   snapshot. Everything else asks for domain objects (meta, districts, ucs,
   series) and never sees fetch or response shapes.
   See docs/data-contract.md for the payloads. */
window.Atlas = window.Atlas || {};

Atlas.data = (function () {
  'use strict';

  var root = Atlas.config.dataRoot;
  var versionOverride = null;
  var ucCache = {}, seriesCache = {};

  // Optional hook fired once when the offline snapshot is used (badge reveal).
  var onOffline = null;

  function setVersion(v) { versionOverride = v; }
  function version() {
    return versionOverride != null ? encodeURIComponent(versionOverride) : Math.floor(Date.now() / 3.6e6);
  }

  // ---- Offline snapshot (loaded only after a fetch fails) -----------------
  var snapshotPromise = null;
  function snapshot() {
    if (window.ATLAS_SNAPSHOT) return Promise.resolve(window.ATLAS_SNAPSHOT);
    if (!snapshotPromise) snapshotPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = Atlas.config.snapshotUrl;
      s.onload = function () { resolve(window.ATLAS_SNAPSHOT); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return snapshotPromise;
  }
  function fromSnapshot(path) {
    return snapshot().then(function (snap) {
      if (!snap || !(path in snap)) throw new Error('not in snapshot: ' + path);
      if (typeof onOffline === 'function') onOffline();
      return JSON.parse(JSON.stringify(snap[path]));
    });
  }

  // ---- Fetch with transparent snapshot fallback ---------------------------
  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
  }

  // Path relative to data/ (e.g. 'meta.json', 'series/PK.KP.CHA.json').
  function getJSON(path, bust) {
    if (window.ATLAS_SNAPSHOT) return fromSnapshot(path);
    return fetchJSON(root + path + '?v=' + (bust || version()))
      .catch(function (err) { return fromSnapshot(path).catch(function () { throw err; }); });
  }

  // Path relative to the site root (e.g. 'strings.json').
  function getText(path, bust) {
    if (window.ATLAS_SNAPSHOT) return fromSnapshot(path);
    return fetchJSON(path + '?v=' + (bust || version()))
      .catch(function (err) { return fromSnapshot(path).catch(function () { throw err; }); });
  }

  // ---- Domain accessors ---------------------------------------------------
  function meta() { return getJSON('meta.json', Math.floor(Date.now() / 3.6e6)); }
  function districts() { return getJSON('districts.geojson'); }

  function ucs(districtId) {
    if (!ucCache[districtId]) {
      ucCache[districtId] = getJSON('ucs/' + districtId + '.geojson')
        .catch(function () { return { type: 'FeatureCollection', features: [] }; });
    }
    return ucCache[districtId];
  }

  function series(id) {
    if (!seriesCache[id]) {
      seriesCache[id] = getJSON('series/' + id + '.json').catch(function () { return null; });
    }
    return seriesCache[id];
  }

  return {
    getJSON: getJSON,
    getText: getText,
    snapshot: snapshot,
    meta: meta,
    districts: districts,
    ucs: ucs,
    series: series,
    setVersion: setVersion,
    setOnOffline: function (fn) { onOffline = fn; }
  };
})();
