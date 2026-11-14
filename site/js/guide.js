/* Renders site/guide.json as the tutorial page, in the language the reader picked
   on the map. Content is data, not markup, so all three languages stay in step. */
(function () {
  'use strict';
  var COLORS = { green: '#15803d', amber: '#d97706', red: '#c2250f', nodata: '#94a3b8' };
  var v = Math.floor(Date.now() / 3.6e6);
  var lang = localStorage.getItem('atlas.lang') || 'en';
  var guide = null, strings = {};

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function icon(n, c) { return window.atlasIcon(n, c); }
  function t(k) { return (strings[lang] && strings[lang][k]) || (strings.en && strings.en[k]) || k; }

  // The one diagram: how the two measured numbers become one coloured class.
  function balanceDiagram() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 560 196');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('legend_title'));
    svg.innerHTML =
      '<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="#677485"/></marker></defs>' +
      '<g font-family="Inter, system-ui, sans-serif">' +
      // needed
      '<rect x="8" y="26" width="150" height="62" rx="10" fill="#eaf0fb" stroke="#bcd0ee"/>' +
      '<text x="83" y="50" text-anchor="middle" font-size="12" fill="#5b6d86">' + esc(t('et')) + '</text>' +
      '<text x="83" y="76" text-anchor="middle" font-size="24" font-weight="700" fill="#0b3d91">28 mm</text>' +
      // minus
      '<text x="178" y="66" text-anchor="middle" font-size="22" fill="#677485">−</text>' +
      // rain
      '<rect x="198" y="26" width="150" height="62" rx="10" fill="#f1f4f8" stroke="#d6dde6"/>' +
      '<text x="273" y="50" text-anchor="middle" font-size="12" fill="#5b6d86">' + esc(t('rain')) + '</text>' +
      '<text x="273" y="76" text-anchor="middle" font-size="24" font-weight="700" fill="#51657e">3 mm</text>' +
      // equals
      '<text x="368" y="66" text-anchor="middle" font-size="22" fill="#677485">=</text>' +
      // deficit
      '<rect x="388" y="26" width="164" height="62" rx="10" fill="#fdeeea" stroke="#f2c3b7"/>' +
      '<text x="470" y="50" text-anchor="middle" font-size="12" fill="#8a5243">' + esc(t('deficit')) + '</text>' +
      '<text x="470" y="76" text-anchor="middle" font-size="24" font-weight="700" fill="#c2250f">25 mm</text>' +
      // down arrow
      '<path d="M470 96 L470 116" stroke="#677485" stroke-width="1.6" marker-end="url(#ar)"/>' +
      // scale
      '<rect x="8" y="132" width="544" height="26" rx="6" fill="#f1f4f8"/>' +
      '<rect x="8" y="132" width="150" height="26" rx="6" fill="#15803d"/>' +
      '<rect x="158" y="132" width="230" height="26" fill="#d97706"/>' +
      '<rect x="388" y="132" width="164" height="26" rx="6" fill="#c2250f"/>' +
      '<rect x="384" y="126" width="8" height="38" rx="2" fill="#0f141b"/>' +
      '<text x="83" y="150" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">0 mm</text>' +
      '<text x="273" y="150" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">1 – 30 mm</text>' +
      '<text x="470" y="150" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">30 mm +</text>' +
      '<text x="280" y="184" text-anchor="middle" font-size="12" fill="#677485">' + esc(t('legend_title')) + '</text>' +
      '</g>';
    return svg;
  }
  function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  function block(b) {
    if (b.p) return el('p', { text: b.p });
    if (b.note) return el('blockquote', { text: b.note });
    if (b.ul) return el('ul', {}, b.ul.map(function (x) { return el('li', { text: x }); }));
    if (b.steps) return el('ol', { 'class': 'steps' }, b.steps.map(function (s) {
      return el('li', {}, [el('h3', { text: s.h }), el('p', { text: s.p })]);
    }));
    if (b.keys) return el('div', { 'class': 'key-grid' }, b.keys.map(function (k) {
      return el('div', { 'class': 'key' }, [
        el('span', { 'class': 'sw', style: 'background:' + COLORS[k.color] }),
        el('div', {}, [el('b', { text: k.b }), el('span', { text: k.s })])]);
    }));
    if (b.glossary) {
      var dl = el('dl', { 'class': 'glossary' });
      b.glossary.forEach(function (g) {
        dl.appendChild(el('dt', { text: g.t }));
        dl.appendChild(el('dd', { text: g.d }));
      });
      return dl;
    }
    if (b.table) {
      var tb = el('table');
      tb.appendChild(el('tr', {}, b.table.head.map(function (h) { return el('th', { text: h }); })));
      b.table.rows.forEach(function (r) {
        tb.appendChild(el('tr', {}, r.map(function (c) { return el('td', { text: c }); })));
      });
      return tb;
    }
    if (b.diagram === 'balance') {
      return el('figure', { 'class': 'diagram' }, [balanceDiagram(),
        el('figcaption', { text: t('legend_note').replace('{basis}', t('basis_cropland')) })]);
    }
    return null;
  }

  function render() {
    var g = guide[lang] || guide.en;
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ur' || lang === 'ps') ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    document.getElementById('langSelect').value = lang;
    document.title = g.title + ' · ' + t('app_title');

    var doc = document.getElementById('doc');
    doc.innerHTML = '';
    doc.appendChild(el('h1', { text: g.title }));
    doc.appendChild(el('p', { 'class': 'lede', text: g.lede }));
    var toc = el('div', { 'class': 'toc' });
    g.sections.forEach(function (s) {
      toc.appendChild(el('a', { href: '#' + s.id }, [icon(s.icon, 'icon-sm'), document.createTextNode(s.title)]));
    });
    doc.appendChild(toc);
    g.sections.forEach(function (s) {
      doc.appendChild(el('h2', { id: s.id }, [icon(s.icon), document.createTextNode(s.title)]));
      s.blocks.forEach(function (b) {
        var node = block(b);
        if (node) doc.appendChild(node);
      });
    });
    doc.appendChild(el('p', { 'class': 'muted', style: 'margin-top:34px' }, [
      el('a', { href: './', text: '← ' + t('show_map') })]));
  }

  Promise.all([
    fetch('guide.json?v=' + v).then(function (r) { return r.json(); }),
    fetch('strings.json?v=' + v).then(function (r) { return r.json(); })
  ]).then(function (res) {
    guide = res[0]; strings = res[1];
    document.getElementById('langSelect').addEventListener('change', function (e) {
      lang = e.target.value;
      localStorage.setItem('atlas.lang', lang);
      render();
      window.scrollTo(0, 0);
    });
    render();
  }).catch(function (err) {
    document.getElementById('doc').innerHTML = '<h1>Guide unavailable</h1><p class="muted">' + err.message + '</p>';
  });
})();
