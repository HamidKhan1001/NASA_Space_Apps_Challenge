/* KP Open Farm Atlas: page controller for index.html.
   Three screens: province -> district -> union council (tehsil). All network,
   formatting, state and translation work is delegated to Atlas services; this
   file only wires them to the map and panel. See docs/data-contract.md. */
(function () {
  'use strict';

  var config = Atlas.config;
  var util = Atlas.util;
  var state = Atlas.state;
  var t = Atlas.i18n.t;
  var data = Atlas.data;
  var states = Atlas.components.states;
  var legend = Atlas.components.legend;

  var COLORS = config.colors;
  var HA_LAYERS = config.haLayers;
  var el = util.el;
  var qs = util.qs;

  var meta = null, districts = null;
  var map, districtLayer = null, ucLayer = null, plotlyPromise = null, firstRender = true;

  function fit(bounds, pad) {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [pad, pad], animate: !firstRender, duration: 0.6 });
    firstRender = false;
  }

  function fmtDate(iso) { return util.fmtDate(iso, state.lang); }
  function fmtInt(n) { return util.fmtInt(n); }
  function fmtMm(n) { return util.fmtMm(n); }
  function dekadLabel(d) { return util.dekadLabel(d, state.lang); }
  function name(props) { return Atlas.i18n.name(props); }

  function statusAt(ser, idx) {
    if (!ser || !ser.dekads[idx]) return { status: 'nodata', deficit_mm: null, et_mm: null, rain_mm: null };
    return ser.dekads[idx];
  }
  function isLatest() { return state.dekadIndex === meta.dekads.length - 1; }

  // On phones the panel is full-screen; showPanel(false) reveals the map.
  function showPanel(on) {
    document.body.classList.toggle('show-map', !on);
    qs('mapToggle').textContent = on ? t('show_map') : t('show_details');
    if (!on && map) setTimeout(function () { map.invalidateSize(); }, 50);
  }

  // ------------------------------------------------------------------ map
  function initMap() {
    map = L.map('map', { zoomControl: true, attributionControl: true, preferCanvas: false }).setView([34.0, 71.5], 7);
    L.tileLayer(config.tile.url, {
      attribution: config.tile.attribution, maxZoom: config.tile.maxZoom, opacity: config.tile.opacity
    }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    qs('mapToggle').addEventListener('click', function () { showPanel(document.body.classList.contains('show-map')); });
  }

  function styleFor(status, dimmed) {
    return { color: '#ffffff', weight: dimmed ? 0.6 : 1.2, fillColor: COLORS[status] || COLORS.nodata, fillOpacity: dimmed ? 0.25 : 0.78 };
  }

  function drawDistricts(statusById) {
    if (districtLayer) map.removeLayer(districtLayer);
    districtLayer = L.geoJSON(districts, {
      style: function (f) {
        var p = f.properties, st = statusById ? statusById[p.district_id] : p.status;
        return styleFor(st, state.level !== 'province');
      },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        layer.bindTooltip(function () {
          var st = statusById ? statusById[p.district_id] : p.status;
          return '<b>' + name(p) + '</b><br>' + t('status_' + st);
        }, { sticky: true });
        layer.on('click', function () { openDistrict(p.district_id); });
      }
    }).addTo(map);
    if (state.level !== 'province' && ucLayer) ucLayer.bringToFront();
  }

  function drawUCs(fc, statusById) {
    if (ucLayer) map.removeLayer(ucLayer);
    var breaks = state.layer !== 'status' ? util.quantiles(fc.features.map(function (f) { return f.properties[state.layer]; })) : null;
    ucLayer = L.geoJSON(fc, {
      style: function (f) {
        var p = f.properties;
        if (state.layer === 'status') return styleFor(statusById ? statusById[p.uc_id] : p.status, false);
        return { color: '#ffffff', weight: 1.2, fillColor: util.haColor(p[state.layer], breaks), fillOpacity: 0.85 };
      },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        layer.bindTooltip(function () {
          var st = statusById ? statusById[p.uc_id] : p.status;
          var extra = state.layer === 'status' ? t('status_' + st) : fmtInt(p[state.layer]) + ' ' + t('ha');
          return '<b>' + p.uc_name_en + '</b><br>' + extra;
        }, { sticky: true });
        layer.on('click', function () { openUC(p.district_id, p.uc_id); });
        if (state.ucId === p.uc_id) layer.setStyle({ color: '#1d2a22', weight: 2.5 });
      }
    }).addTo(map);
    ucLayer.bringToFront();
    return breaks;
  }

  // Statuses for the selected dekad; null means "use what the polygons carry".
  function statusesFor(features, idKey) {
    if (isLatest()) return Promise.resolve(null);
    return Promise.all(features.map(function (f) { return data.series(f.properties[idKey]); })).then(function (all) {
      var out = {};
      all.forEach(function (s, i) { out[features[i].properties[idKey]] = statusAt(s, state.dekadIndex).status; });
      return out;
    });
  }

  function renderLegend(breaks) {
    legend.render({
      node: qs('legend'),
      level: state.level,
      layer: state.layer,
      dekad: meta.dekads[state.dekadIndex],
      thresholds: meta.thresholds,
      breaks: breaks
    });
  }

  // ------------------------------------------------------------------ screens
  function openProvince() {
    state.level = 'province'; state.districtId = null; state.ucId = null; state.layer = 'status';
    if (ucLayer) { map.removeLayer(ucLayer); ucLayer = null; }
    states.setLoading(true);
    statusesFor(districts.features, 'district_id').then(function (st) {
      drawDistricts(st);
      fit(districtLayer.getBounds(), 10);
      renderLegend();
      renderProvincePanel(st);
      showPanel(window.innerWidth > config.breakpoints.mobile);
      states.setLoading(false);
    });
    history.replaceState(null, '', '#');
  }

  function renderProvincePanel(statusById) {
    var panel = qs('panel'); panel.innerHTML = '';
    var counts = { green: 0, amber: 0, red: 0, nodata: 0 };
    districts.features.forEach(function (f) { counts[statusById ? statusById[f.properties.district_id] : f.properties.status]++; });
    panel.appendChild(el('div', { 'class': 'crumbs', text: t('province') }));
    panel.appendChild(el('h2', { text: t('province_title') }));
    panel.appendChild(el('p', { 'class': 'sub', text: t('province_sub', { dekad: dekadLabel(meta.dekads[state.dekadIndex]) }) }));
    var kv = el('div', { 'class': 'kv' });
    ['red', 'amber', 'green', 'nodata'].forEach(function (s) {
      kv.appendChild(el('div', {}, [el('div', { 'class': 'k', text: t('status_' + s) }), el('div', { 'class': 'v', text: counts[s], style: 'color:' + (s === 'nodata' ? '#555' : COLORS[s]) })]));
    });
    panel.appendChild(kv);
    var list = el('ul', { 'class': 'list' });
    districts.features.slice().sort(function (a, b) { return (b.properties.deficit_mm || -1e9) - (a.properties.deficit_mm || -1e9); }).forEach(function (f) {
      var p = f.properties, st = statusById ? statusById[p.district_id] : p.status;
      list.appendChild(el('li', { onclick: function () { openDistrict(p.district_id); } }, [
        el('span', { 'class': 'dot', style: 'background:' + COLORS[st] }), el('span', { text: name(p) }),
        el('span', { 'class': 'num', text: isLatest() && p.deficit_mm != null ? fmtMm(p.deficit_mm) + ' ' + t('mm') : '' })
      ]));
    });
    panel.appendChild(el('p', { 'class': 'muted', text: t('tap_district') }));
    panel.appendChild(list);
    panel.appendChild(sourcesBlock());
    Atlas.motion.reveal(panel, { y: 10 });
  }

  function openDistrict(did, keepLayer) {
    state.level = 'district'; state.districtId = did; state.ucId = null;
    if (!keepLayer) state.layer = state.layer || 'status';
    states.setLoading(true);
    var dFeature = districts.features.filter(function (f) { return f.properties.district_id === did; })[0];
    Promise.all([data.ucs(did), data.series(did)]).then(function (res) {
      var fc = res[0], dser = res[1];
      return statusesFor(fc.features, 'uc_id').then(function (st) {
        drawDistricts(null);
        var breaks = drawUCs(fc, st);
        if (ucLayer.getLayers().length) fit(ucLayer.getBounds(), 20);
        renderLegend(breaks);
        renderDistrictPanel(dFeature, fc, dser, st);
        if (!keepLayer) showPanel(true);
        states.setLoading(false);
      });
    });
    history.replaceState(null, '', '#' + did);
  }

  function renderDistrictPanel(dFeature, fc, dser, statusById) {
    var p = dFeature.properties, panel = qs('panel'); panel.innerHTML = '';
    panel.appendChild(el('div', { 'class': 'crumbs' }, [el('button', { text: t('province'), onclick: openProvince }), el('span', { text: '\u203a' }), el('span', { text: name(p) })]));
    panel.appendChild(el('h2', { text: name(p) }));
    panel.appendChild(el('p', { 'class': 'sub', text: t('district_sub', { n: fc.features.length }) }));
    var cur = statusAt(dser, state.dekadIndex);
    if (isLatest() && !dser) cur = p;
    panel.appendChild(statusCard(cur, p));
    panel.appendChild(hectares(p));
    var chips = el('div', { 'class': 'chips' });
    ['status'].concat(HA_LAYERS).forEach(function (k) {
      chips.appendChild(el('button', { 'class': state.layer === k ? 'on' : '', text: t('layer_' + k), onclick: function () { state.layer = k; openDistrict(p.district_id, true); } }));
    });
    panel.appendChild(el('div', { 'class': 'k muted', text: t('layers') }));
    panel.appendChild(chips);
    var list = el('ul', { 'class': 'list' });
    fc.features.slice().sort(function (a, b) { return (b.properties.deficit_mm || -1e9) - (a.properties.deficit_mm || -1e9); }).forEach(function (f) {
      var u = f.properties, st = statusById ? statusById[u.uc_id] : u.status;
      list.appendChild(el('li', { onclick: function () { openUC(u.district_id, u.uc_id); } }, [
        el('span', { 'class': 'dot', style: 'background:' + COLORS[st] }), el('span', { text: u.uc_name_en }),
        el('span', { 'class': 'num', text: state.layer === 'status' ? (isLatest() && u.deficit_mm != null ? fmtMm(u.deficit_mm) + ' ' + t('mm') : '') : fmtInt(u[state.layer]) + ' ' + t('ha') })
      ]));
    });
    panel.appendChild(el('p', { 'class': 'muted', text: t('tap_uc') }));
    panel.appendChild(list);
    panel.appendChild(actions(dser, p.district_id, name(p)));
    panel.appendChild(sourcesBlock(dser));
    Atlas.motion.reveal(panel, { y: 10 });
  }

  function openUC(did, ucId) {
    state.level = 'uc'; state.districtId = did; state.ucId = ucId;
    states.setLoading(true);
    Promise.all([data.ucs(did), data.series(ucId)]).then(function (res) {
      var fc = res[0], ser = res[1];
      var f = fc.features.filter(function (x) { return x.properties.uc_id === ucId; })[0];
      if (!f) { openDistrict(did); return; }
      return statusesFor(fc.features, 'uc_id').then(function (st) {
        drawUCs(fc, st);
        renderLegend();
        renderUCPanel(f, ser);
        showPanel(true);
        var layer = ucLayer.getLayers().filter(function (l) { return l.feature.properties.uc_id === ucId; })[0];
        if (layer && window.innerWidth > config.breakpoints.mobile) fit(layer.getBounds(), 40);
        states.setLoading(false);
      });
    });
    history.replaceState(null, '', '#' + ucId);
  }

  function renderUCPanel(f, ser) {
    var p = f.properties, panel = qs('panel'); panel.innerHTML = '';
    panel.appendChild(el('div', { 'class': 'crumbs' }, [
      el('button', { text: t('province'), onclick: openProvince }), el('span', { text: '\u203a' }),
      el('button', { text: name(p), onclick: function () { openDistrict(p.district_id); } }), el('span', { text: '\u203a' }), el('span', { text: p.uc_name_en })]));
    panel.appendChild(el('h2', { text: p.uc_name_en }));
    panel.appendChild(el('p', { 'class': 'sub', text: t('uc_sub', { district: name(p) }) }));
    var cur = statusAt(ser, state.dekadIndex);
    if (isLatest() && !ser) cur = p;
    panel.appendChild(statusCard(cur, p));
    panel.appendChild(trendLine(ser));
    panel.appendChild(hectares(p));
    panel.appendChild(el('h3', { text: t('chart_title'), style: 'font-size:14px;margin:14px 0 0' }));
    var chart = el('div', { 'class': 'chart', id: 'chart' });
    panel.appendChild(chart);
    renderChart(chart, ser);
    panel.appendChild(actions(ser, p.uc_id, p.uc_name_en));
    panel.appendChild(sourcesBlock(ser));
    Atlas.motion.reveal(panel, { y: 10 });
  }

  // ------------------------------------------------------------------ panel pieces
  function statusCard(cur, p) {
    var st = cur.status || 'nodata';
    var card = el('div', { 'class': 'status-card ' + st });
    if (st === 'nodata') {
      card.appendChild(el('div', { 'class': 'big', text: t('status_nodata') }));
      card.appendChild(el('div', { 'class': 'what', text: p.irrigated_ha === 0 ? t('nodata_no_irrigated') : t('nodata_missing') }));
      return card;
    }
    var def = cur.deficit_mm;
    card.appendChild(el('div', { 'class': 'big', html: (def > 0 ? fmtMm(def) : fmtMm(Math.abs(def))) + ' <small>' + t('mm') + ' ' + (def > 0 ? t('deficit') : t('surplus')) + '</small>' }));
    card.appendChild(el('div', { 'class': 'what', text: t('status_sentence', { et: fmtMm(cur.et_mm), rain: fmtMm(cur.rain_mm), ha: fmtInt(p.irrigated_ha) }) }));
    card.appendChild(el('div', { 'class': 'what', text: t('status_' + st) + ' \u00b7 ' + thresholdText(st) }));
    return card;
  }
  function thresholdText(st) {
    var m = meta.thresholds.amber.max_deficit_mm;
    if (st === 'green') return t('rule_green');
    if (st === 'amber') return t('rule_amber', { max: m });
    return t('rule_red', { max: m });
  }
  function trendLine(ser) {
    if (!ser) return el('p', { 'class': 'trend muted', text: t('no_series') });
    var run = 0, rows = ser.dekads;
    if (!rows.length || rows[rows.length - 1].deficit_mm == null) return el('span');
    for (var i = rows.length - 1; i >= 1; i--) {
      if (rows[i].deficit_mm != null && rows[i - 1].deficit_mm != null && rows[i].deficit_mm > rows[i - 1].deficit_mm) run++; else break;
    }
    var text = run >= 2 ? t('trend_up', { n: run + 1 }) : run === 1 ? t('trend_up_one') : t('trend_flat');
    return el('p', { 'class': 'trend', text: text });
  }
  function hectares(p) {
    var kv = el('div', { 'class': 'kv' });
    HA_LAYERS.forEach(function (k) {
      kv.appendChild(el('div', {}, [el('div', { 'class': 'k', text: t('layer_' + k) }), el('div', { 'class': 'v', html: fmtInt(p[k]) + ' <small>' + t('ha') + '</small>' })]));
    });
    return kv;
  }
  function actions(ser, id, label) {
    var box = el('div', { 'class': 'actions' });
    box.appendChild(el('button', { 'class': 'btn', text: t('download_csv'), onclick: function () { downloadCSV(ser, id, label); } }));
    box.appendChild(el('a', { 'class': 'btn ghost', text: t('download_geojson'), href: config.dataRoot + (state.level === 'uc' ? 'ucs/' + state.districtId + '.geojson' : 'districts.geojson'), download: '' }));
    return box;
  }
  function sourcesBlock(ser) {
    var s = meta.sources, box = el('div', { 'class': 'sources' });
    box.appendChild(el('div', { html: '<b>' + t('sources') + '</b>' }));
    ['crops', 'et', 'rain', 'boundaries'].forEach(function (k) {
      var flag = s[k].status === 'live' ? '' : ' \u00b7 ' + t('synthetic');
      box.appendChild(el('div', { text: s[k].name + flag }));
    });
    box.appendChild(el('div', { text: t('generated', { ts: (ser && ser.generated_at) || meta.generated_at }) }));
    box.appendChild(el('div', {}, [el('a', { href: 'methods.html', text: t('methods') + ' \u2192' })]));
    return box;
  }

  // ------------------------------------------------------------------ chart (Plotly, lazy; table fallback)
  function loadPlotly() {
    if (window.Plotly) return Promise.resolve();
    if (!plotlyPromise) plotlyPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = config.plotlyUrl; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
    return plotlyPromise;
  }
  function renderChart(node, ser) {
    if (!ser) { node.replaceWith(el('p', { 'class': 'muted', text: t('no_series') })); return; }
    var x = ser.dekads.map(function (d) { return fmtDate(d.start); });
    loadPlotly().then(function () {
      Plotly.newPlot(node, [
        { type: 'bar', name: t('et'), x: x, y: ser.dekads.map(function (d) { return d.et_mm; }), marker: { color: '#1565c0' } },
        { type: 'bar', name: t('rain'), x: x, y: ser.dekads.map(function (d) { return d.rain_mm; }), marker: { color: '#90a4ae' } },
        { type: 'scatter', mode: 'lines+markers', name: t('deficit'), x: x, y: ser.dekads.map(function (d) { return d.deficit_mm; }), line: { color: '#37474f', width: 2 } }
      ], {
        barmode: 'group', margin: { l: 36, r: 8, t: 8, b: 28 }, height: 240,
        legend: { orientation: 'h', y: 1.15, font: { size: 11 } }, yaxis: { title: { text: t('mm'), font: { size: 11 } }, zeroline: true },
        xaxis: { tickfont: { size: 10 } }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: 'inherit' }
      }, { displayModeBar: false, responsive: true, staticPlot: false });
    }).catch(function () {
      var tbl = el('table', { 'class': 'chart-table' });
      tbl.appendChild(el('tr', {}, [el('th', { text: t('dekad') }), el('th', { text: t('et') }), el('th', { text: t('rain') }), el('th', { text: t('deficit') })]));
      ser.dekads.forEach(function (d) {
        tbl.appendChild(el('tr', {}, [el('td', { text: dekadLabel(d) }), el('td', { text: fmtMm(d.et_mm) }), el('td', { text: fmtMm(d.rain_mm) }), el('td', { text: fmtMm(d.deficit_mm) })]));
      });
      node.replaceWith(tbl);
    });
  }

  // ------------------------------------------------------------------ CSV
  function downloadCSV(ser, id, label) {
    var rows = [['id', 'name', 'dekad_start', 'dekad_end', 'et_mm', 'rain_mm', 'deficit_mm', 'status']];
    (ser ? ser.dekads : []).forEach(function (d) { rows.push([id, label, d.start, d.end, d.et_mm, d.rain_mm, d.deficit_mm, d.status]); });
    rows.push([]);
    rows.push(['# sources', ser ? Object.keys(ser.sources).map(function (k) { return k + ': ' + ser.sources[k]; }).join(' | ') : '']);
    rows.push(['# generated_at', (ser && ser.generated_at) || meta.generated_at]);
    Atlas.csv.download('kp-atlas-' + id + '.csv', rows);
  }

  // ------------------------------------------------------------------ language, dekad, boot
  function applyLang() {
    Atlas.state.setLang(state.lang);
    Atlas.i18n.setLang(state.lang);
    Atlas.i18n.apply(document);
    document.title = t('app_title');
    qs('langSelect').value = state.lang;
    fillDekads();
    qs('footGenerated').textContent = t('generated', { ts: meta.generated_at });
    qs('footSources').textContent = t('footer_sources');
  }
  function fillDekads() {
    var sel = qs('dekadSelect'); sel.innerHTML = '';
    meta.dekads.forEach(function (d, i) { sel.appendChild(el('option', { value: i, text: dekadLabel(d) + (i === meta.dekads.length - 1 ? ' \u00b7 ' + t('latest') : '') })); });
    sel.value = state.dekadIndex;
  }
  function rerender() {
    if (state.level === 'uc') openUC(state.districtId, state.ucId);
    else if (state.level === 'district') openDistrict(state.districtId, true);
    else openProvince();
  }

  function boot() {
    data.setOnOffline(function () { qs('offlineBadge').hidden = false; });
    initMap();
    Promise.all([
      data.meta(),
      Atlas.i18n.load()
    ]).then(function (res) {
      meta = res[0];
      data.setVersion(meta.generated_at);
      state.dekadIndex = meta.dekads.length - 1;
      qs('demoBadge').hidden = meta.mode === 'live';
      return data.districts();
    }).then(function (fc) {
      districts = fc;
      applyLang();
      qs('langSelect').addEventListener('change', function (e) { state.lang = e.target.value; applyLang(); rerender(); });
      qs('dekadSelect').addEventListener('change', function (e) { state.dekadIndex = Number(e.target.value); renderLegend(); rerender(); });
      var hash = location.hash.slice(1);
      if (hash && /^PK\.KP\.[A-Z]{3}\./.test(hash)) openUC(hash.split('.').slice(0, 3).join('.'), hash);
      else if (hash && /^PK\.KP\.[A-Z]{3}$/.test(hash)) openDistrict(hash);
      else openProvince();
    }).catch(function (err) {
      states.setLoading(false);
      states.showError(qs('panel'), err);
    });
  }
  boot();
})();
