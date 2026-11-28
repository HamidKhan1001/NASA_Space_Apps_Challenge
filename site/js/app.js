/* KP Open Farm Atlas. Static site that reads /data (see docs/data-contract.md).
   Three views: province, district, union council. No framework, no build step.
   This controller wires the shared modules (config, utils, services, components)
   to the Leaflet map and the details panel; it owns no URLs or data shapes. */
(function () {
  'use strict';

  // Shared modules own the URLs, helpers, state and data access.
  var cfg = window.Atlas.config, util = window.Atlas.util, data = window.Atlas.data;
  var i18n = window.Atlas.i18n, state = window.Atlas.state, csv = window.Atlas.csv;
  var motion = window.Atlas.motion;
  var states = window.Atlas.components.states, legend = window.Atlas.components.legend;
  // Layer catalog + helpers live in js/layers and js/services; the map reads them
  // instead of hardcoding which layers exist.
  var Layers = window.AtlasLayers, LayerControl = window.AtlasLayerControl, Temporal = window.AtlasTemporal;

  var COLORS = cfg.colors;
  var qs = util.qs, el = util.el;
  var fmtInt = util.fmtInt, fmtMm = util.fmtMm, fmtDate = util.fmtDate;
  var dekadLabel = util.dekadLabel, stamp = util.stamp;
  var quantiles = util.quantiles, haColor = util.haColor;
  // Layers may carry fixed class breaks and their own colour ramp (the history layer);
  // otherwise hectares are shaded by quintile rank within the units on screen.
  function breaksFor(layer, features) {
    return layer.breaks || quantiles(features.map(function (f) { return f.properties[layer.id]; }));
  }
  function shade(layer, value, breaks) {
    return haColor(value, breaks, layer.ramp ? cfg[layer.ramp] : null);
  }
  function t(key, vars) { return i18n.t(key, vars); }
  function nameOf(p) { return i18n.name(p); }

  var meta = null, districts = null;
  var map, districtLayer = null, ucLayer = null, plotlyPromise = null, firstFit = true;
  var baseLayers = {}, labelOverlay = null, activeBase = localStorage.getItem('atlas.base') || 'light';
  var showLabels = localStorage.getItem('atlas.labels') !== 'off';
  var provinceStatuses = null;

  // ------------------------------------------------------------------ helpers
  function icon(name, cls) { return window.atlasIcon(name, cls); }
  function setLoading(on) { states.setLoading(on); }
  function showPanel(on) {
    document.body.classList.toggle('show-map', !on);
    qs('mapToggleLabel').textContent = on ? t('show_map') : t('show_details');
    if (!on && map) setTimeout(function () { map.invalidateSize(); }, 60);
  }
  function renderLegend(breaks) { legend.render({ breaks: breaks }); }

  // Data access is delegated to the shared data service
  // (js/services/data-service.js), which owns the data/ URLs, caching and the
  // offline snapshot. The controller only asks for domain objects.
  function DATA() { return data.DATA(); }
  function getJSON(path, bust) { return data.getJSON(path, bust); }
  function series(id) { return data.series(id); }
  function loadUCs(did) { return data.loadUCs(did); }
  function loadAllUCs() { return data.loadAllUCs(); }

  // Province view: districts until the reader zooms in, then every union council.
  var DETAIL_ZOOM = cfg.detailZoom;
  function syncDetail() {
    if (state.level !== 'province') return;
    var want = map.getZoom() >= DETAIL_ZOOM;
    if (want === state.detail) return;
    state.detail = want;
    if (!want) {
      if (ucLayer) { map.removeLayer(ucLayer); ucLayer = null; }
      renderLegend(drawDistricts(provinceStatuses));
      return;
    }
    setLoading(true);
    loadAllUCs().then(function (fc) {
      if (state.level !== 'province' || !state.detail) { setLoading(false); return; }
      return statusesFor(fc.features, 'uc_id').then(function (st) {
        drawDistricts(provinceStatuses);
        renderLegend(drawUCs(fc, st));
        setLoading(false);
      });
    });
  }

  function dekadAt(ser, i) {
    if (!ser || !ser.dekads || !ser.dekads[i]) return { status: 'nodata', deficit_mm: null, et_mm: null, rain_mm: null };
    return ser.dekads[i];
  }
  function isLatest() { return state.dekadIndex === meta.dekads.length - 1; }
  function hasCropType() { return meta.sources.crop_type && meta.sources.crop_type.status === 'live'; }
  function demandLabel() { return meta.et_method === 'wapor_aeti' ? t('demand_actual') : t('demand_ref'); }
  function currentLayer() { return Layers.resolve(state.layer); }
  function isStatusLayer() { return currentLayer().id === 'status'; }
  function layerUnit(l) { return t((l || currentLayer()).unit); }
  // keep the header period control in step with whether the active layer is time-based
  function syncTemporal() { if (Temporal) Temporal.apply(Layers.isTemporal(currentLayer().id), t); }

  // ------------------------------------------------------------------ map
  var BASES_TILE = cfg.tileBases;
  var LABEL_TILE = cfg.labelTile;

  function setBase(key) {
    activeBase = BASES_TILE[key] ? key : 'light';
    localStorage.setItem(cfg.baseStorageKey, activeBase);
    Object.keys(baseLayers).forEach(function (k) {
      if (map.hasLayer(baseLayers[k])) map.removeLayer(baseLayers[k]);
    });
    if (!baseLayers[activeBase]) {
      var cfgBase = BASES_TILE[activeBase];
      baseLayers[activeBase] = L.tileLayer(cfgBase.url, { attribution: cfgBase.attr, maxZoom: cfgBase.max });
    }
    baseLayers[activeBase].addTo(map).bringToBack();
    if (labelOverlay) map.removeLayer(labelOverlay);
    if (BASES_TILE[activeBase].labels) {
      labelOverlay = L.tileLayer(LABEL_TILE, { maxZoom: 16, opacity: activeBase === 'imagery' ? 0.9 : 1,
        pane: 'shadowPane', attribution: '' });
      labelOverlay.addTo(map);
    }
    document.body.classList.toggle('dark-base', activeBase === 'imagery');
    var box = qs('baseSwitch');
    if (box) Array.prototype.forEach.call(box.children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-base') === activeBase);
    });
    restyle();
  }

  function buildMapControls() {
    var box = qs('baseSwitch');
    box.innerHTML = '';
    [['light', 'map'], ['imagery', 'satellite'], ['terrain', 'layers']].forEach(function (b) {
      box.appendChild(el('button', { type: 'button', 'data-base': b[0], title: t('base_' + b[0]),
        'aria-label': t('base_' + b[0]), onclick: function () { setBase(b[0]); } }, [icon(b[1], 'icon-sm')]));
    });
    Array.prototype.forEach.call(box.children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-base') === activeBase);
    });
    var lab = qs('labelToggle');
    lab.setAttribute('title', t('toggle_labels'));
    lab.setAttribute('aria-label', t('toggle_labels'));
    lab.classList.toggle('on', showLabels);
    lab.addEventListener('click', function () {
      showLabels = !showLabels;
      localStorage.setItem(cfg.labelsStorageKey, showLabels ? 'on' : 'off');
      lab.classList.toggle('on', showLabels);
      rerender(true);
    });
  }

  // Real map extent for the HUD (degrees, from the current view; no data involved).
  function dms(v, pos, neg) {
    var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60);
    return d + '°' + (m < 10 ? '0' : '') + m + '\u2032' + (v >= 0 ? pos : neg);
  }
  function updateHud() {
    var hud = qs('hud'); if (!hud || !map) return;
    var b = map.getBounds();
    hud.textContent = '';
    hud.appendChild(el('span', { dir: 'ltr', text: t('hud_extent') + ': ' + dms(b.getSouth(), 'N', 'S') + '–' + dms(b.getNorth(), 'N', 'S') +
      ' · ' + dms(b.getWest(), 'E', 'W') + '–' + dms(b.getEast(), 'E', 'W') }));
  }
  // No-data areas are drawn with a 45° hatch so they read as "unmapped", never as a colour class.
  function ensureHatch() {
    var svg = map && map.getPane('overlayPane').querySelector('svg');
    if (!svg || svg.querySelector('#kp-hatch')) return;
    var ns = 'http://www.w3.org/2000/svg';
    var defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = '<pattern id="kp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" fill="#dbe2ec"/><line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" stroke-width="2"/></pattern>';
    svg.insertBefore(defs, svg.firstChild);
  }
  function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 5 }).setView([34.2, 71.8], 7);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.on('zoomend moveend', updateLabels);
    map.on('moveend', updateHud);
    map.on('layeradd zoomend', ensureHatch);
    map.on('zoomend', syncDetail);
    setBase(activeBase);
    qs('mapToggle').addEventListener('click', function () {
      showPanel(document.body.classList.contains('show-map'));
    });
  }
  function detailHint() {
    if (state.level !== 'province') return null;
    return el('p', { 'class': 'hint' }, [
      el('span', { text: state.detail ? t('detail_on') : t('detail_off') })]);
  }
  function restyle() {
    if (!districtLayer) return;
    if (isStatusLayer()) {
      districtLayer.setStyle(function (f) {
        return styleFor(f.properties._st || f.properties.status, state.level !== 'province');
      });
      return;
    }
    var layer = currentLayer();
    var breaks = breaksFor(layer, districts.features);
    var dim = state.level !== 'province' || state.detail;
    districtLayer.setStyle(function (f) { return rampStyle(shade(layer, f.properties[layer.id], breaks), dim); });
  }
  function fit(bounds, pad) {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [pad, pad], animate: !firstFit, duration: 0.5 });
    firstFit = false;
  }
  function styleFor(status, dim) {
    var dark = activeBase === 'imagery';
    return { color: dark ? '#0f141b' : '#ffffff', weight: dim ? 0.7 : 1.1, opacity: dim ? 0.6 : 1,
             fillColor: status === 'nodata' || !COLORS[status] ? 'url(#kp-hatch)' : COLORS[status], fillOpacity: dim ? 0.2 : (dark ? 0.62 : 0.8) };
  }
  function rampStyle(fillColor, dim) {
    var dark = activeBase === 'imagery';
    return { color: dark ? '#0f141b' : '#ffffff', weight: dim ? 0.7 : 1.1, opacity: dim ? 0.6 : 1,
             fillColor: fillColor, fillOpacity: dim ? 0.2 : (dark ? 0.62 : 0.85) };
  }
  function hoverable(layer, baseStyle) {
    layer.on('mouseover', function () {
      layer.setStyle({ weight: 2.6, color: '#0f141b', fillOpacity: 0.9 });
      if (layer.bringToFront) layer.bringToFront();
    });
    layer.on('mouseout', function () { layer.setStyle(baseStyle()); });
  }
  var labelled = [];
  function addLabel(layer, html) {
    if (!showLabels) {
      layer.bindTooltip(html, { sticky: true, className: 'map-label hover-only', opacity: 1 });
      return;
    }
    layer._atlasLabel = html;
    labelled.push(layer);
  }
  // Leaflet has no label collision handling, so only label polygons that are
  // large enough on screen to hold the text. Re-evaluated on every zoom and pan.
  function updateLabels() {
    if (!showLabels) return;
    var minW = 64, minH = 30;
    labelled.forEach(function (layer) {
      if (!layer._atlasLabel || !map.hasLayer(layer)) return;
      var b = layer.getBounds();
      var nw = map.latLngToContainerPoint(b.getNorthWest());
      var se = map.latLngToContainerPoint(b.getSouthEast());
      var big = (se.x - nw.x) >= minW && (se.y - nw.y) >= minH;
      var onScreen = map.getBounds().intersects(b);
      if (big && onScreen) {
        if (!layer.getTooltip()) {
          layer.bindTooltip(layer._atlasLabel, { permanent: true, direction: 'center',
            className: 'map-label', opacity: 1, interactive: false });
        }
      } else if (layer.getTooltip()) {
        layer.unbindTooltip();
      }
    });
  }
  function resetLabels() { labelled = []; }
  function tooltip(title, sub) {
    return '<b>' + title + '</b><br><span class="tt-sub">' + sub + '</span>';
  }

  function drawDistricts(statusById) {
    if (districtLayer) map.removeLayer(districtLayer);
    resetLabels();
    var layer = currentLayer();
    var status = layer.id === 'status';
    var dim = state.level !== 'province' || state.detail;
    var breaks = status ? null
      : breaksFor(layer, districts.features);
    function fill(p) { return status ? styleFor(p._st, dim) : rampStyle(shade(layer, p[layer.id], breaks), dim); }
    districtLayer = L.geoJSON(districts, {
      style: function (f) { var p = f.properties; p._st = statusById ? statusById[p.district_id] : p.status; return fill(p); },
      onEachFeature: function (f, layer2) {
        var p = f.properties;
        p._st = statusById ? statusById[p.district_id] : p.status;
        if (!dim) {
          var val = status
            ? (isLatest() && p.deficit_mm != null ? Math.round(p.deficit_mm) + ' ' + t('mm') : '')
            : (p[layer.id] == null ? '' : fmtInt(p[layer.id]) + ' ' + layerUnit(layer));
          addLabel(layer2, '<span class="ml-n">' + nameOf(p) + '</span>' +
            (val ? '<span class="ml-v">' + val + '</span>' : ''));
          hoverable(layer2, function () { return status ? styleFor(p._st, false) : rampStyle(shade(layer, p[layer.id], breaks), false); });
        }
        layer2.on('click', function () { openDistrict(p.district_id); });
      }
    }).addTo(map);
    if (dim && ucLayer) ucLayer.bringToFront();
    updateLabels();
    return breaks;
  }

  function drawUCs(fc, statusById) {
    if (ucLayer) map.removeLayer(ucLayer);
    var layer = currentLayer();
    var status = layer.id === 'status';
    var breaks = status ? null
      : breaksFor(layer, fc.features);
    ucLayer = L.geoJSON(fc, {
      style: function (f) {
        var p = f.properties;
        if (status) return styleFor(statusById ? statusById[p.uc_id] : p.status, false);
        return rampStyle(shade(layer, p[layer.id], breaks), false);
      },
      onEachFeature: function (f, lyr) {
        var p = f.properties;
        var st = statusById ? statusById[p.uc_id] : p.status;
        var val = status
          ? (isLatest() && p.deficit_mm != null ? Math.round(p.deficit_mm) + ' ' + t('mm') : '')
          : (p[layer.id] == null ? '' : fmtInt(p[layer.id]) + ' ' + layerUnit(layer));
        addLabel(lyr, '<span class="ml-n">' + p.uc_name_en + '</span>' +
          (val ? '<span class="ml-v">' + val + '</span>' : ''));
        hoverable(lyr, function () {
          return status ? styleFor(st, false) : rampStyle(shade(layer, p[layer.id], breaks), false);
        });
        lyr.on('click', function () { openUC(p.district_id, p.uc_id); });
        if (state.ucId === p.uc_id) lyr.setStyle({ color: '#0f141b', weight: 2.8, fillOpacity: 0.92 });
      }
    }).addTo(map);
    ucLayer.bringToFront();
    updateLabels();
    return breaks;
  }

  function statusesFor(features, idKey) {
    if (isLatest()) return Promise.resolve(null);
    return Promise.all(features.map(function (f) { return series(f.properties[idKey]); })).then(function (all) {
      var out = {};
      all.forEach(function (s, i) { out[features[i].properties[idKey]] = dekadAt(s, state.dekadIndex).status; });
      return out;
    });
  }

  // ------------------------------------------------------------------ province
  function openProvince(keepView) {
    state.level = 'province'; state.districtId = null; state.ucId = null;
    if (!Layers.isAvailable(currentLayer(), meta, districts.features)) state.layer = Layers.defaultId;
    if (ucLayer) { map.removeLayer(ucLayer); ucLayer = null; }
    setLoading(true);
    statusesFor(districts.features, 'district_id').then(function (st) {
      provinceStatuses = st;
      state.detail = map.getZoom() >= DETAIL_ZOOM;
      var breaks = drawDistricts(st);
      if (!keepView && !state.playing) fit(districtLayer.getBounds(), 12);
      renderLegend(breaks);
      renderProvince(st);
      showPanel(window.innerWidth > 820);
      setLoading(false);
      syncDetail();
    });
    history.replaceState(null, '', '#');
  }

  // switch the active map layer from anywhere; keeps the current view and level
  function setLayer(id) {
    if (!Layers.get(id) || id === state.layer) return;
    state.layer = id;
    if (Layers.get(id).latestOnly) {
      // the history percentile is computed for the latest dekad only
      state.dekadIndex = meta.dekads.length - 1;
      qs('dekadSelect').value = state.dekadIndex;
      setPlaying(false);
    }
    if (state.level === 'province') openProvince(true);
    else if (state.level === 'district') openDistrict(state.districtId, true);
    else if (state.level === 'uc') openUC(state.districtId, state.ucId);
  }

  function valueOf(p) {
    var layer = currentLayer();
    if (layer.id === 'status') return isLatest() ? p.deficit_mm : null;
    return p[layer.id];
  }
  function valueText(p) {
    var layer = currentLayer();
    if (layer.id === 'status') return isLatest() && p.deficit_mm != null ? fmtMm(p.deficit_mm) + ' ' + t('mm') : '';
    return p[layer.id] == null ? t('not_connected') : fmtInt(p[layer.id]) + ' ' + layerUnit(layer);
  }
  function renderProvince(statusById) {
    var layer = currentLayer();
    var status = layer.id === 'status';
    var breaks = status ? null : breaksFor(layer, districts.features);
    var inner = panelShell();
    inner.appendChild(el('div', { 'class': 'crumbs' }, [el('span', { 'class': 'here', text: t('province') })]));
    inner.appendChild(el('div', { 'class': 'title-row' }, [el('h1', { text: t('province') })]));
    inner.appendChild(el('p', { 'class': 'sub', text: t('province_sub', { dekad: dekadLabel(meta.dekads[state.dekadIndex]) }) }));

    var counts = { green: 0, amber: 0, red: 0, nodata: 0 };
    districts.features.forEach(function (f) {
      counts[statusById ? statusById[f.properties.district_id] : f.properties.status]++;
    });
    inner.appendChild(el('h2', {}, [icon('droplet'), document.createTextNode(t('summary_title'))]));
    var grid = el('div', { 'class': 'stats' });
    ['red', 'amber', 'green', 'nodata'].forEach(function (s) {
      grid.appendChild(el('div', { 'class': 'stat' }, [
        el('div', { 'class': 'k' }, [el('span', { 'class': 'sw', style: 'background:' + COLORS[s] }),
          document.createTextNode(t('status_' + s))]),
        el('div', { 'class': 'v num', text: counts[s] })]));
    });
    inner.appendChild(grid);
    var headline = el('p', { 'class': 'headline', hidden: true });
    inner.appendChild(headline);
    provinceHeadline(headline);

    inner.appendChild(el('h2', {}, [icon('layers'), document.createTextNode(t('layers'))]));
    inner.appendChild(LayerControl.render({
      currentId: layer.id, meta: meta, features: districts.features, t: t, onSelect: setLayer
    }));

    inner.appendChild(el('h2', {}, [icon('chart'), document.createTextNode(t('trend_title'))]));
    var trend = el('div', { 'class': 'chart', style: 'height:180px' });
    inner.appendChild(trend);
    provinceTrend(trend);

    inner.appendChild(el('h2', {}, [icon('map'), document.createTextNode(t('districts_title', { n: districts.features.length }))]));
    inner.appendChild(searchBox());
    var rows = districts.features.slice().sort(function (a, b) {
      var av = valueOf(a.properties), bv = valueOf(b.properties);
      return (bv == null ? -1e9 : bv) - (av == null ? -1e9 : av);
    }).filter(matchQuery(function (p) { return nameOf(p) + ' ' + p.name_en; }));
    var list = el('ul', { 'class': 'list' });
    rows.forEach(function (f) {
      var p = f.properties, st = statusById ? statusById[p.district_id] : p.status;
      var dot = status ? COLORS[st] : shade(layer, p[layer.id], breaks);
      var row = listRow(dot, nameOf(p), valueText(p), function () { openDistrict(p.district_id); });
      list.appendChild(row);
      if (status) movement(p.district_id, row);
    });
    if (!rows.length) list.appendChild(el('li', { 'class': 'hint', text: t('no_match') }));
    inner.appendChild(list);
    inner.appendChild(el('p', { 'class': 'hint', text: t('tap_district') }));
    var hint = detailHint();
    if (hint) inner.appendChild(hint);
    inner.appendChild(sourcesBlock());
  }

  // One sentence that separates "red by the fixed rule" from "unusual for the season".
  // Counts only; the percentile and the status both come from the pipeline.
  function provinceHeadline(node) {
    if (!baselineOn()) return;
    var notable = meta.baseline.notable_percentile;
    Promise.all(districts.features.map(function (f) { return series(f.properties.district_id); })).then(function (all) {
      var red = 0, redTypical = 0, unusual = 0, known = 0;
      all.forEach(function (s) {
        var d = dekadAt(s, state.dekadIndex);
        if (d.pct == null) return;
        known++;
        if (d.status === 'red') { red++; if (d.pct < notable) redTypical++; }
        if (d.pct >= notable) unusual++;
      });
      if (!known) return;
      var parts = [t('headline_red', { red: red, n: known, max: meta.thresholds.amber.max_deficit_mm })];
      if (red) parts.push(t('headline_typical', { typical: redTypical }));
      parts.push(t('headline_unusual', { unusual: unusual, share: 100 - notable }));
      node.textContent = parts.join(' ');
      node.hidden = false;
    });
  }

  function provinceTrend(node) {
    Promise.all(districts.features.map(function (f) { return series(f.properties.district_id); }))
      .then(function (all) {
        var counts = meta.dekads.map(function () { return { green: 0, amber: 0, red: 0, nodata: 0 }; });
        var got = 0;
        all.forEach(function (ser) {
          if (!ser || !ser.dekads) return;
          got++;
          ser.dekads.forEach(function (d, i) { if (counts[i]) counts[i][d.status]++; });
        });
        if (!got) { node.replaceWith(el('p', { 'class': 'hint', text: t('no_series') })); return; }
        var x = meta.dekads.map(function (d) { return fmtDate(d.start); });
        var bar = function (key, color) {
          return { type: 'bar', name: t('status_' + key), x: x,
                   y: counts.map(function (c) { return c[key]; }), marker: { color: color },
                   hovertemplate: '%{y} ' + t('districts_word') + '<extra>' + t('status_' + key) + '</extra>' };
        };
        loadPlotly().then(function () {
          Plotly.newPlot(node, [bar('red', COLORS.red), bar('amber', COLORS.amber),
                                bar('green', COLORS.green), bar('nodata', COLORS.nodata)], {
            barmode: 'stack', height: 230, margin: { l: 30, r: 8, t: 6, b: 82 },
            legend: { orientation: 'h', x: 0, y: -0.22, yanchor: 'top', font: { size: 10 } },
            yaxis: { gridcolor: '#eef1f6', fixedrange: true },
            xaxis: { tickfont: { size: 10 }, fixedrange: true },
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: 'Inter, system-ui, sans-serif', color: '#39414d' }
          }, { displayModeBar: false, responsive: true });
        }).catch(function () {
          var tbl = el('table', { 'class': 'chart-table' });
          tbl.appendChild(el('tr', {}, [el('th', { text: t('dekad') }), el('th', { text: t('status_red') }),
            el('th', { text: t('status_amber') }), el('th', { text: t('status_green') })]));
          counts.forEach(function (c, i) {
            tbl.appendChild(el('tr', {}, [el('td', { text: dekadLabel(meta.dekads[i]) }),
              el('td', { text: c.red }), el('td', { text: c.amber }), el('td', { text: c.green })]));
          });
          node.replaceWith(tbl);
        });
      });
  }

  // ------------------------------------------------------------------ district
  function openDistrict(did, keepView) {
    state.level = 'district'; state.districtId = did; state.ucId = null;
    if (!keepView) state.query = '';
    setLoading(true);
    var dFeature = districts.features.filter(function (f) { return f.properties.district_id === did; })[0];
    Promise.all([loadUCs(did), series(did)]).then(function (res) {
      var fc = res[0], dser = res[1];
      return statusesFor(fc.features, 'uc_id').then(function (st) {
        drawDistricts(null);
        var breaks = drawUCs(fc, st);
        if (!keepView && !state.playing && ucLayer.getLayers().length) fit(ucLayer.getBounds(), 24);
        renderLegend(breaks);
        renderDistrict(dFeature, fc, dser, st);
        if (!keepView) showPanel(true);
        setLoading(false);
      });
    });
    history.replaceState(null, '', '#' + did);
  }

  function renderDistrict(dFeature, fc, dser, statusById) {
    var p = dFeature.properties, inner = panelShell();
    inner.appendChild(el('div', { 'class': 'crumbs' }, [
      el('button', { onclick: function () { openProvince(); } }, [icon('chevron-left', 'icon-sm'), document.createTextNode(t('province'))]),
      el('span', { 'class': 'here', text: nameOf(p) })]));
    inner.appendChild(el('div', { 'class': 'title-row' }, [el('h1', { text: nameOf(p) })]));
    inner.appendChild(el('p', { 'class': 'sub', text: t('district_sub', { n: fc.features.length }) }));

    inner.appendChild(statusCard(currentFor(dser, p), p));
    inner.appendChild(el('h2', {}, [icon('sprout'), document.createTextNode(t('land_title'))]));
    inner.appendChild(hectares(p));
    if (hasCropType()) inner.appendChild(cropYearNote()); else inner.appendChild(cropTypeNotice());

    inner.appendChild(el('h2', {}, [icon('layers'), document.createTextNode(t('layers'))]));
    inner.appendChild(LayerControl.render({
      currentId: currentLayer().id, meta: meta, features: fc.features, t: t, onSelect: setLayer
    }));

    inner.appendChild(el('h2', {}, [icon('chart'), document.createTextNode(t('chart_title'))]));
    var dchart = el('div', { 'class': 'chart' });
    inner.appendChild(dchart);
    renderChart(dchart, dser);

    inner.appendChild(el('h2', {}, [icon('map'), document.createTextNode(t('ucs_title', { n: fc.features.length }))]));
    inner.appendChild(searchBox());
    var layer = currentLayer();
    var status = layer.id === 'status';
    var breaks = status ? null : breaksFor(layer, fc.features);
    var rows = fc.features.slice().sort(function (a, b) {
      var av = valueOf(a.properties), bv = valueOf(b.properties);
      return (bv == null ? -1e9 : bv) - (av == null ? -1e9 : av);
    }).filter(matchQuery(function (q) { return q.uc_name_en; }));
    var list = el('ul', { 'class': 'list' });
    rows.forEach(function (f) {
      var u = f.properties, st = statusById ? statusById[u.uc_id] : u.status;
      var dot = status ? COLORS[st] : shade(layer, u[layer.id], breaks);
      var row = listRow(dot, u.uc_name_en, valueText(u), function () { openUC(u.district_id, u.uc_id); },
        !status && u[layer.id] == null);
      list.appendChild(row);
      if (status) movement(u.uc_id, row);
    });
    if (!rows.length) list.appendChild(el('li', { 'class': 'hint', text: t('no_match') }));
    inner.appendChild(list);
    inner.appendChild(el('p', { 'class': 'hint', text: t('tap_uc') }));
    inner.appendChild(actions(dser, p.district_id, nameOf(p)));
    inner.appendChild(sourcesBlock(dser));
  }

  // ------------------------------------------------------------------ union council
  function openUC(did, ucId) {
    state.level = 'uc'; state.districtId = did; state.ucId = ucId;
    setLoading(true);
    Promise.all([loadUCs(did), series(ucId)]).then(function (res) {
      var fc = res[0], ser = res[1];
      var f = fc.features.filter(function (x) { return x.properties.uc_id === ucId; })[0];
      if (!f) { openDistrict(did); return; }
      return statusesFor(fc.features, 'uc_id').then(function (st) {
        renderLegend(drawUCs(fc, st));
        renderUC(f, ser);
        showPanel(true);
        var layer = ucLayer.getLayers().filter(function (l) { return l.feature.properties.uc_id === ucId; })[0];
        if (layer && window.innerWidth > 820) fit(layer.getBounds(), 48);
        setLoading(false);
      });
    });
    history.replaceState(null, '', '#' + ucId);
  }

  function renderUC(f, ser) {
    var p = f.properties, inner = panelShell();
    inner.appendChild(el('div', { 'class': 'crumbs' }, [
      el('button', { onclick: function () { openProvince(); } }, [icon('chevron-left', 'icon-sm'), document.createTextNode(t('province'))]),
      icon('chevron-right', 'icon-sm'),
      el('button', { onclick: function () { openDistrict(p.district_id); } }, [document.createTextNode(nameOf(p))]),
      el('span', { 'class': 'here', text: p.uc_name_en })]));
    inner.appendChild(el('div', { 'class': 'title-row' }, [el('h1', { text: p.uc_name_en })]));
    inner.appendChild(el('p', { 'class': 'sub', text: t('uc_sub', { district: nameOf(p) }) }));

    inner.appendChild(statusCard(currentFor(ser, p), p));
    inner.appendChild(trendLine(ser));

    inner.appendChild(el('h2', {}, [icon('sprout'), document.createTextNode(t('land_title'))]));
    inner.appendChild(hectares(p));
    if (hasCropType()) inner.appendChild(cropYearNote()); else inner.appendChild(cropTypeNotice());

    inner.appendChild(el('h2', {}, [icon('chart'), document.createTextNode(t('chart_title'))]));
    var chart = el('div', { 'class': 'chart' });
    inner.appendChild(chart);
    renderChart(chart, ser);
    inner.appendChild(actions(ser, p.uc_id, p.uc_name_en));
    inner.appendChild(sourcesBlock(ser));
  }

  // ------------------------------------------------------------------ pieces
  function panelShell() {
    var panel = qs('panel');
    panel.innerHTML = '';
    var inner = el('div', { 'class': 'panel-inner' });
    panel.appendChild(inner);
    panel.scrollTop = 0;
    motion.reveal(inner);
    return inner;
  }
  function currentFor(ser, p) {
    var cur = dekadAt(ser, state.dekadIndex);
    if (isLatest() && !ser) return { status: p.status, deficit_mm: p.deficit_mm, et_mm: p.et_mm, rain_mm: p.rain_mm };
    return cur;
  }
  function matchQuery(getter) {
    var q = state.query.trim().toLowerCase();
    return function (f) { return !q || getter(f.properties).toLowerCase().indexOf(q) >= 0; };
  }
  function searchBox() {
    var input = el('input', { type: 'search', value: state.query, placeholder: t('search_ph'),
      'aria-label': t('search_ph'), oninput: function (e) {
        state.query = e.target.value;
        var pos = e.target.selectionStart;
        rerender(true);
        var again = document.querySelector('.search input');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
      } });
    var box = el('div', { 'class': 'search' }, [icon('search', 'icon-sm'), input]);
    if (state.query) box.appendChild(el('button', { type: 'button', 'aria-label': t('clear'),
      onclick: function () { state.query = ''; rerender(true); } }, [icon('close', 'icon-sm')]));
    return box;
  }
  function listRow(color, name, value, onclick, muted) {
    return el('li', { onclick: onclick, tabindex: '0', onkeydown: function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(); }
    } }, [
      el('span', { 'class': 'dot', style: 'background:' + color }),
      el('span', { 'class': 'nm', text: name }),
      value ? el('span', { 'class': 'val num' + (muted ? ' muted' : ''), text: value }) : null,
      icon('chevron-right', 'go icon-sm')
    ]);
  }
  // a small arrow next to the value: did this unit get drier or wetter?
  function movement(id, row) {
    series(id).then(function (ser) {
      if (!ser || !ser.dekads || state.dekadIndex < 1) return;
      var now = ser.dekads[state.dekadIndex], prev = ser.dekads[state.dekadIndex - 1];
      if (!now || !prev || now.deficit_mm == null || prev.deficit_mm == null) return;
      var diff = now.deficit_mm - prev.deficit_mm;
      if (Math.abs(diff) < 1) return;
      var val = row.querySelector('.val');
      if (!val) return;
      var mark = el('span', { 'class': 'move ' + (diff > 0 ? 'worse' : 'better'),
        title: (diff > 0 ? '+' : '') + fmtMm(diff) + ' ' + t('mm') + ' ' + t('vs_previous'),
        text: diff > 0 ? '\u25B2' : '\u25BC' });
      val.parentNode.insertBefore(mark, val);
    });
  }
  function statusCard(cur, p) {
    var st = cur.status || 'nodata';
    var card = el('div', { 'class': 'status-card' });
    card.appendChild(el('div', { 'class': 'status-bar ' + st }));
    var body = el('div', { 'class': 'status-body' });
    body.appendChild(el('span', { 'class': 'status-tag ' + st }, [
      icon(st === 'green' ? 'check' : st === 'nodata' ? 'info' : 'alert', 'icon-sm'),
      document.createTextNode(t('status_' + st))]));
    if (st === 'nodata') {
      body.appendChild(el('p', { 'class': 'status-what', text: !p.crop_ha ? t('nodata_no_crop') : t('nodata_missing') }));
      card.appendChild(body);
      return card;
    }
    var def = cur.deficit_mm;
    body.appendChild(el('div', { 'class': 'status-big' }, [
      el('span', { 'class': 'v num', text: fmtMm(Math.abs(def)) }),
      el('span', { 'class': 'u', text: t('mm') + ' ' + (def > 0 ? t('deficit') : t('surplus')) })]));
    body.appendChild(el('div', { 'class': 'balance' }, [
      el('div', {}, [el('div', { 'class': 'k' }, [icon('droplet', 'icon-sm'), document.createTextNode(t('et'))]),
        el('div', { 'class': 'v num' }, [document.createTextNode(fmtMm(cur.et_mm)), el('small', { text: ' ' + t('mm') })])]),
      el('div', {}, [el('div', { 'class': 'k' }, [icon('rain', 'icon-sm'), document.createTextNode(t('rain'))]),
        el('div', { 'class': 'v num' }, [document.createTextNode(fmtMm(cur.rain_mm)), el('small', { text: ' ' + t('mm') })])])]));
    body.appendChild(el('p', { 'class': 'status-what',
      text: t('status_sentence', { ha: fmtInt(p.crop_ha), basis: t('basis_' + (meta.status_basis === 'cropland' ? 'cropland' : 'irrigated')) }) }));
    body.appendChild(el('p', { 'class': 'status-rule', text: thresholdText(st) }));
    var hist = historyBlock(cur, st);
    if (hist) body.appendChild(hist);
    card.appendChild(body);
    return card;
  }
  // How unusual is this dekad's deficit for this place and time of year? Context only:
  // the pipeline computes the percentile, the traffic light stays the fixed rule.
  function baselineOn() { return !!(meta.baseline && meta.baseline.method === meta.et_method); }
  function historyBlock(cur, st) {
    if (!baselineOn() || cur.pct == null) return null;
    var bl = meta.baseline, notable = bl.notable_percentile;
    var box = el('div', { 'class': 'history' });
    box.appendChild(el('div', { 'class': 'history-head' }, [icon('chart', 'icon-sm'),
      document.createTextNode(t('hist_title', { from: bl.first_year, to: bl.last_year }))]));
    var track = el('div', { 'class': 'pct-track', role: 'img',
      'aria-label': t('hist_aria', { pct: cur.pct }) });
    track.style.background = 'linear-gradient(90deg,' + cfg.pctRamp.join(',') + ')';
    track.appendChild(el('span', { 'class': 'pct-mark', style: 'left:' + cur.pct + '%' }));
    box.appendChild(track);
    box.appendChild(el('div', { 'class': 'pct-ends' }, [
      el('span', { text: t('pct_low') }), el('span', { text: t('pct_high') })]));
    box.appendChild(el('p', { 'class': 'history-text', text: t('hist_sentence', {
      pct: cur.pct, normal: cur.normal_mm == null ? '–' : fmtMm(cur.normal_mm) }) }));
    var callout = null;
    if (notable != null && cur.pct >= notable) {
      callout = el('p', { 'class': 'history-flag dry' }, [icon('alert', 'icon-sm'),
        document.createTextNode(t('hist_unusual', { share: 100 - notable }))]);
    } else if (notable != null && st === 'red') {
      callout = el('p', { 'class': 'history-flag' }, [icon('info', 'icon-sm'),
        document.createTextNode(t('hist_red_typical'))]);
    }
    if (callout) box.appendChild(callout);
    box.appendChild(el('p', { 'class': 'history-note', text: t('hist_note', { from: bl.first_year, to: bl.last_year }) }));
    return box;
  }
  function thresholdText(st) {
    var m = meta.thresholds.amber.max_deficit_mm;
    return st === 'green' ? t('rule_green') : st === 'amber' ? t('rule_amber', { max: m }) : t('rule_red', { max: m });
  }
  function trendLine(ser) {
    if (!ser || !ser.dekads.length || ser.dekads[ser.dekads.length - 1].deficit_mm == null) return el('span');
    var rows = ser.dekads, run = 0;
    for (var i = rows.length - 1; i >= 1; i--) {
      if (rows[i].deficit_mm != null && rows[i - 1].deficit_mm != null && rows[i].deficit_mm > rows[i - 1].deficit_mm) run++;
      else break;
    }
    var up = run >= 1;
    return el('p', { 'class': 'trend' + (run >= 2 ? ' up' : '') }, [
      icon(up ? 'alert' : 'check', 'icon-sm'),
      el('span', { text: run >= 2 ? t('trend_up', { n: run + 1 }) : run === 1 ? t('trend_up_one') : t('trend_flat') })]);
  }
  function hectares(p) {
    var grid = el('div', { 'class': 'stats' });
    Layers.continuous().forEach(function (L2) {
      var v = p[L2.id], has = v != null;
      grid.appendChild(el('div', { 'class': 'stat' + (has ? '' : ' empty') }, [
        el('div', { 'class': 'k' }, [icon(L2.icon, 'icon-sm'), document.createTextNode(t(L2.nameKey))]),
        has ? el('div', { 'class': 'v num' }, [document.createTextNode(fmtInt(v)), el('small', { text: ' ' + layerUnit(L2) })])
            : el('div', { 'class': 'v', text: t('not_connected') })]));
    });
    return grid;
  }
  function cropYearNote() {
    return hasCropType() ? el('p', { 'class': 'hint', text: t('crop_year_note') }) : null;
  }
  function cropTypeNotice() {
    return el('div', { 'class': 'notice' }, [icon('info', 'icon-sm'),
      el('span', {}, [document.createTextNode(t('crop_type_notice') + ' '),
        el('a', { href: 'methods.html', text: t('read_methods') })])]);
  }
  function shareButton() {
    var btn = el('button', { 'class': 'btn ghost', type: 'button' },
      [icon('external', 'icon-sm'), el('span', { text: t('share') })]);
    btn.addEventListener('click', function () {
      var url = location.href;
      var done = function () {
        btn.lastChild.textContent = t('copied');
        setTimeout(function () { btn.lastChild.textContent = t('share'); }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { prompt(t('share'), url); });
      } else {
        prompt(t('share'), url);
      }
    });
    return btn;
  }
  function actions(ser, id, label) {
    return el('div', { 'class': 'actions' }, [
      el('button', { 'class': 'btn', type: 'button', onclick: function () { downloadCSV(ser, id, label); } },
        [icon('download', 'icon-sm'), document.createTextNode(t('download_csv'))]),
      el('a', { 'class': 'btn ghost', download: '',
        href: DATA() + (state.level === 'uc' ? 'ucs/' + state.districtId + '.geojson' : 'districts.geojson') },
        [icon('download', 'icon-sm'), document.createTextNode(t('download_geojson'))]),
      shareButton()]);
  }
  function sourcesBlock(ser) {
    var box = el('div', { 'class': 'sources' });
    box.appendChild(el('div', {}, [el('b', { text: t('sources') })]));
    ['cropland', 'crop_type', 'water_demand', 'rain', 'boundaries'].forEach(function (k) {
      var s = meta.sources[k];
      if (!s) return;
      var off = s.status !== 'live';
      box.appendChild(el('div', { 'class': 'src' + (off ? ' off' : '') }, [
        icon(off ? 'close' : 'check', 'icon-sm'),
        el('span', { text: s.name + (off ? ' — ' + t('not_connected') : '') })]));
    });
    box.appendChild(el('div', { 'class': 'stamp', text: t('generated', { ts: stamp((ser && ser.generated_at) || meta.generated_at) }) }));
    return box;
  }

  // ------------------------------------------------------------------ chart
  function loadPlotly() {
    if (window.Plotly) return Promise.resolve();
    if (!plotlyPromise) plotlyPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = cfg.plotlyUrl;
      s.integrity = cfg.plotlyIntegrity; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return plotlyPromise;
  }
  function renderChart(node, ser) {
    if (!ser) { node.replaceWith(el('p', { 'class': 'hint', text: t('no_series') })); return; }
    var x = ser.dekads.map(function (d) { return fmtDate(d.start); });
    var narrow = (node.clientWidth || window.innerWidth) < 420;
    loadPlotly().then(function () {
      Plotly.newPlot(node, [
        { type: 'bar', name: t('et'), x: x, y: ser.dekads.map(function (d) { return d.et_mm; }),
          marker: { color: '#0b3d91' }, hovertemplate: '%{y:.1f} mm<extra>' + t('et') + '</extra>' },
        { type: 'bar', name: t('rain'), x: x, y: ser.dekads.map(function (d) { return d.rain_mm; }),
          marker: { color: '#9fb3c8' }, hovertemplate: '%{y:.1f} mm<extra>' + t('rain') + '</extra>' },
        { type: 'scatter', mode: 'lines+markers', name: t('deficit'),
          x: x, y: ser.dekads.map(function (d) { return d.deficit_mm; }),
          line: { color: '#c2250f', width: 2 }, marker: { size: 6 },
          hovertemplate: '%{y:.1f} mm<extra>' + t('deficit') + '</extra>' }
    ].concat(baselineOn() && ser.dekads.some(function (d) { return d.normal_mm != null; }) ? [
        { type: 'scatter', mode: 'lines', name: narrow ? t('normal_short') : t('normal_line', { from: meta.baseline.first_year, to: meta.baseline.last_year }),
          x: x, y: ser.dekads.map(function (d) { return d.normal_mm; }),
          line: { color: '#6b7280', width: 1.6, dash: 'dot' }, connectgaps: false,
          hovertemplate: '%{y:.1f} mm<extra>' + t('normal_short') + '</extra>' }
      ] : []), {
        barmode: 'group', height: narrow ? 330 : 280, margin: { l: 38, r: 10, t: 8, b: narrow ? 108 : 80 },
        legend: { orientation: 'h', x: 0, y: -0.2, yanchor: 'top', font: { size: narrow ? 10 : 11 } },
        yaxis: { title: { text: t('mm'), font: { size: 11 } }, gridcolor: '#eef1f6', zerolinecolor: '#cbd5e1' },
        xaxis: { tickfont: { size: 10 } }, hovermode: 'x unified',
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Inter, system-ui, sans-serif', color: '#39414d' }
      }, { displayModeBar: false, responsive: true });
    }).catch(function () {
      var tbl = el('table', { 'class': 'chart-table' });
      tbl.appendChild(el('tr', {}, [el('th', { text: t('dekad') }), el('th', { text: t('et') }),
        el('th', { text: t('rain') }), el('th', { text: t('deficit') })]));
      ser.dekads.forEach(function (d) {
        tbl.appendChild(el('tr', {}, [el('td', { text: dekadLabel(d) }), el('td', { 'class': 'num', text: fmtMm(d.et_mm) }),
          el('td', { 'class': 'num', text: fmtMm(d.rain_mm) }), el('td', { 'class': 'num', text: fmtMm(d.deficit_mm) })]));
      });
      node.replaceWith(tbl);
    });
  }

  // ------------------------------------------------------------------ CSV
  function downloadCSV(ser, id, label) {
    var rows = [['id', 'name', 'dekad_start', 'dekad_end', 'water_needed_mm', 'rain_mm', 'deficit_mm', 'status',
      'typical_deficit_mm', 'percentile_vs_history']];
    (ser ? ser.dekads : []).forEach(function (d) {
      rows.push([id, label, d.start, d.end, d.et_mm, d.rain_mm, d.deficit_mm, d.status,
        d.normal_mm == null ? '' : d.normal_mm, d.pct == null ? '' : d.pct]);
    });
    if (meta.baseline) rows.push(['# history', 'percentile of this dekad among the same dekad in ' +
      meta.baseline.first_year + '-' + meta.baseline.last_year + ' (same method, same point); 100 = driest; context only']);
    rows.push([]);
    rows.push(['# method', ser ? ser.et_method : meta.et_method]);
    rows.push(['# sources', ser ? Object.keys(ser.sources).map(function (k) { return k + ': ' + ser.sources[k]; }).join(' | ') : '']);
    rows.push(['# generated_at', (ser && ser.generated_at) || meta.generated_at]);
    csv.download('kp-atlas-' + id + '.csv', rows);
  }

  // ------------------------------------------------------------------ language, boot
  function applyLang() {
    i18n.applyRoot();
    i18n.apply(document);
    document.title = t('app_title');
    qs('langSelect').value = state.lang;
    try { localStorage.setItem(cfg.langStorageKey, state.lang); } catch (e) {}
    fillDekads();
    syncTemporal();
    qs('footGenerated').textContent = t('generated', { ts: stamp(meta.generated_at) });
    qs('footSources').textContent = t('footer_sources');
    qs('mapToggleLabel').textContent = document.body.classList.contains('show-map') ? t('show_details') : t('show_map');
  }
  var playTimer = null;
  function setPlaying(on) {
    state.playing = on;
    var btn = qs('playBtn');
    btn.classList.toggle('on', on);
    var use = btn.querySelector('use');
    if (use) use.setAttribute('href', on ? '#i-pause' : '#i-play');
    btn.setAttribute('aria-label', on ? t('pause') : t('play'));
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    if (!on) return;
    playTimer = setInterval(function () {
      state.dekadIndex = (state.dekadIndex + 1) % meta.dekads.length;
      qs('dekadSelect').value = state.dekadIndex;
      rerender(true);
    }, 1500);
  }
  function fillDekads() {
    var sel = qs('dekadSelect');
    sel.innerHTML = '';
    meta.dekads.forEach(function (d, i) {
      sel.appendChild(el('option', { value: i,
        text: dekadLabel(d) + (i === meta.dekads.length - 1 ? ' · ' + t('latest') : '') }));
    });
    sel.value = state.dekadIndex;
  }
  function rerender(keepView) {
    if (state.level === 'uc') openUC(state.districtId, state.ucId);
    else if (state.level === 'district') openDistrict(state.districtId, keepView !== false);
    else openProvince();
  }

  function boot() {
    initMap();
    data.setOnOffline(function () { var b = qs('offlineBadge'); if (b) b.hidden = false; });
    Promise.all([
      data.getJSON('meta.json', Math.floor(Date.now() / 3.6e6)),
      data.getText(cfg.stringsUrl)
    ]).then(function (res) {
      meta = res[0]; data.setMeta(meta); i18n.setStrings(res[1]);
      state.dekadIndex = meta.dekads.length - 1;
      qs('demoBadge').hidden = meta.mode === 'live';
      return data.getJSON('districts.geojson');
    }).then(function (fc) {
      districts = fc;
      buildMapControls();
      applyLang();
      qs('langSelect').addEventListener('change', function (e) { state.setLang(e.target.value); applyLang(); rerender(true); });
      qs('dekadSelect').addEventListener('change', function (e) {
        setPlaying(false);
        state.dekadIndex = Number(e.target.value);
        rerender(true);
      });
      qs('playBtn').addEventListener('click', function () { setPlaying(!state.playing); });
      // Escape steps back up a level; the map keeps keyboard focus usable
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (state.level === 'uc') openDistrict(state.districtId);
        else if (state.level === 'district') openProvince();
      });
      var hash = location.hash.slice(1);
      if (/^PK\.KP\.[A-Z]{3}\./.test(hash)) openUC(hash.split('.').slice(0, 3).join('.'), hash);
      else if (/^PK\.KP\.[A-Z]{3}$/.test(hash)) openDistrict(hash);
      else openProvince();
    }).catch(function (err) {
      setLoading(false);
      states.showError(qs('panel'), err);
    });
  }
  boot();
})();
