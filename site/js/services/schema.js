/* Boundary validation for payloads from data/. Cheap shape checks only: they
   stop a malformed or truncated file from reaching the UI. Full contract
   checking lives in pipeline/validate_data.py. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Atlas = root.Atlas || {}; root.Atlas.schema = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fail(what) { throw new Error('Invalid data: ' + what); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function meta(m) {
    if (!isObj(m)) fail('meta.json is not an object');
    if (typeof m.generated_at !== 'string') fail('meta.generated_at missing');
    if (!Array.isArray(m.dekads) || !m.dekads.length) fail('meta.dekads missing or empty');
    return m;
  }
  function featureCollection(fc, label) {
    if (!isObj(fc) || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) fail((label || 'geojson') + ' is not a FeatureCollection');
    return fc;
  }
  function series(s) {
    if (!isObj(s) || !Array.isArray(s.dekads)) fail('series.dekads missing');
    return s;
  }
  return { meta: meta, featureCollection: featureCollection, series: series };
});
