/* Shared application state. One mutable object so any module can read the
   current language, drill-down level, selected dekad and active layer without
   threading arguments through every call. */
window.Atlas = window.Atlas || {};

Atlas.state = (function () {
  'use strict';

  var store = {
    lang: (function () {
      try { return localStorage.getItem(Atlas.config.langStorageKey) || 'en'; }
      catch (e) { return 'en'; }
    })(),
    level: 'province',   // province | district | uc
    districtId: null,
    ucId: null,
    dekadIndex: null,    // index into meta.dekads; latest by default
    layer: 'status'      // status | crop_ha | wheat_ha | maize_ha | irrigated_ha
  };

  store.setLang = function (lang) {
    store.lang = lang;
    try { localStorage.setItem(Atlas.config.langStorageKey, lang); } catch (e) {}
  };

  return store;
})();
