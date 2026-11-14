/* i18n service: loads the central dictionary, resolves keys with a safe
   English fallback, and keeps <html lang/dir> in sync. No page-specific text
   is hardcoded anywhere else. */
window.Atlas = window.Atlas || {};

Atlas.i18n = (function () {
  'use strict';

  var strings = {};
  var lang = 'en';

  function load() {
    return Atlas.data.getText(Atlas.config.stringsUrl).then(function (data) {
      strings = data || {};
      return strings;
    });
  }

  function t(key, vars) {
    var s = (strings[lang] && strings[lang][key]) || (strings.en && strings.en[key]) || key;
    return s.replace(/\{(\w+)\}/g, function (_, k) {
      return vars && vars[k] != null ? vars[k] : '';
    });
  }

  // Pick the localised feature name, falling back to English.
  function name(props) { return props['name_' + lang] || props.name_en; }

  function setLang(next) {
    lang = next;
    document.documentElement.lang = next;
    document.documentElement.dir = Atlas.util.isRtl(next) ? 'rtl' : 'ltr';
  }

  function getLang() { return lang; }

  // Fill every [data-i18n] node in the given root with its translated text.
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(function (n) {
      n.textContent = t(n.getAttribute('data-i18n'));
    });
  }

  return {
    load: load,
    t: t,
    name: name,
    setLang: setLang,
    getLang: getLang,
    apply: apply
  };
})();
