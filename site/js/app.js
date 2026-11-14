/* KP Open Farm Atlas. Static site that reads /data (see docs/data-contract.md).
   Three views: province, district, union council. No framework, no build step. */
(function () {
  'use strict';

  // Where the data contract sits relative to this page. 'data/' is the deployed
  // layout (build-site.sh copies it in). '../data/' covers someone serving the
  // repository root straight from a clone. If neither answers, the bundled
  // snapshot takes over, so the page never dies on a 404.
  var BASES = ['data/', '../data/'];
  var baseIndex = 0;
  function DATA() { return BASES[baseIndex]; }
  var COLORS = { green: '#15803d', amber: '#d97706', red: '#c2250f', nodata: '#94a3b8' };
  var RAMP = ['#eef4ea', '#cfe2c4', '#a3cb98', '#5fa86d', '#15803d'];
  var HA_LAYERS = [
    { key: 'crop_ha', icon: 'sprout' },
    { key: 'wheat_ha', icon: 'wheat' },
    { key: 'maize_ha', icon: 'maize' },
    { key: 'irrigated_ha', icon: 'irrigation' }
  ];

  var state = {
    lang: localStorage.getItem('atlas.lang') || 'en',
    level: 'province', districtId: null, ucId: null,
    dekadIndex: null, layer: 'status', query: '', detail: false
  };
  var meta = null, strings = {}, districts = null;
  var ucCache = {}, seriesCache = {};
  var map, districtLayer = null, ucLayer = null, plotlyPromise = null, firstFit = true;
  var baseLayers = {}, labelOverlay = null, activeBase = localStorage.getItem('atlas.base') || 'light';
  var showLabels = localStorage.getItem('atlas.labels') !== 'off';
  var legendOpen = localStorage.getItem('atlas.legend') !== 'closed';

  // ------------------------------------------------------------------ helpers
  function qs(id) { return document.getElementById(id); }
  function icon(name, cls) { return window.atlasIcon(name, cls); }
  function t(key, vars) {
    var s = (strings[state.lang] && strings[state.lang][key]) || (strings.en && strings.en[key]) || key;
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  function nameOf(p) { return p['name_' + state.lang] || p.name_en; }
  function fmtInt(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }
  function fmtMm(n) { return n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US'); }
  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    var loc = state.lang === 'en' ? 'en-GB' : state.lang === 'ur' ? 'ur-PK' : 'ps-AF';
    try { return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
    catch (e) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  }
  function dekadLabel(d) { return fmtDate(d.start) + ' – ' + fmtDate(d.end); }
  function stamp(iso) { return String(iso || '').replace('T', ' ').replace('Z', ' UTC'); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function setLoading(on) { qs('loading').hidden = !on; }
  function showPanel(on) {
    document.body.classList.toggle('show-map', !on);
    qs('mapToggleLabel').textContent = on ? t('show_map') : t('show_details');
    if (!on && map) setTimeout(function () { map.invalidateSize(); }, 60);
  }

  // offline fallback: js/data-snapshot.js is loaded only if a fetch fails
  var snapshotPromise = null;
  function snapshot() {
    if (window.ATLAS_SNAPSHOT) return Promise.resolve(window.ATLAS_SNAPSHOT);
    if (!snapshotPromise) snapshotPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/data-snapshot.js';
      s.onload = function () { resolve(window.ATLAS_SNAPSHOT); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return snapshotPromise;
  }
  function fromSnapshot(path) {
    return snapshot().then(function (snap) {
      if (!snap || !(path in snap)) throw new Error('not in snapshot: ' + path);
      qs('offlineBadge').hidden = false;
      return JSON.parse(JSON.stringify(snap[path]));
    });
  }
  function version() { return meta ? encodeURIComponent(meta.generated_at) : Math.floor(Date.now() / 3.6e6); }
  function fetchFrom(base, path, bust) {
    return fetch(base + path + '?v=' + (bust || version()), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + path); return r.json(); });
  }
  function getJSON(path, bust) {
    if (window.ATLAS_SNAPSHOT) return fromSnapshot(path);
    return fetchFrom(DATA(), path, bust).catch(function (err) {
      // try the other layout once, then fall back to the offline snapshot
      for (var i = 0; i < BASES.length; i++) {
        if (i === baseIndex) continue;
        return fetchFrom(BASES[i], path, bust).then(function (data) {
          baseIndex = i;
          return data;
        }).catch(function () {
          return fromSnapshot(path).catch(function () { throw err; });
        });
      }
      return fromSnapshot(path).catch(function () { throw err; });
    });
  }
  function series(id) {
    if (!seriesCache[id]) seriesCache[id] = getJSON('series/' + id + '.json').catch(function () { return null; });
    return seriesCache[id];
  }
  var allUCsPromise = null;
  function loadAllUCs() {
    if (!allUCsPromise) allUCsPromise = getJSON('ucs/all.geojson')
      .catch(function () { return { type: 'FeatureCollection', features: [] }; });
    return allUCsPromise;
  }
  // Province view: districts until the reader zooms in, then every union council.
  var DETAIL_ZOOM = 8;
  function syncDetail() {
    if (state.level !== 'province') return;
    var want = map.getZoom() >= DETAIL_ZOOM;
    if (want === state.detail) return;
    state.detail = want;
    if (!want) {
      if (ucLayer) { map.removeLayer(ucLayer); ucLayer = null; }
      drawDistricts(provinceStatuses);
      renderLegend();
      return;
    }
    setLoading(true);
    loadAllUCs().then(function (fc) {
      if (state.level !== 'province' || !state.detail) { setLoading(false); return; }
      return statusesFor(fc.features, 'uc_id').then(function (st) {
        drawDistricts(provinceStatuses);
        drawUCs(fc, st);
        setLoading(false);
      });
    });
  }
  var provinceStatuses = null;

  function loadUCs(did) {
    if (!ucCache[did]) ucCache[did] = getJSON('ucs/' + did + '.geojson')
      .catch(function () { return { type: 'FeatureCollection', features: [] }; });
    return ucCache[did];
  }
  function dekadAt(ser, i) {
    if (!ser || !ser.dekads || !ser.dekads[i]) return { status: 'nodata', deficit_mm: null, et_mm: null, rain_mm: null };
    return ser.dekads[i];
  }
  function isLatest() { return state.dekadIndex === meta.dekads.length - 1; }
  function hasCropType() { return meta.sources.crop_type && meta.sources.crop_type.status === 'live'; }
  function demandLabel() { return meta.et_method === 'wapor_aeti' ? t('demand_actual') : t('demand_ref'); }

  // ------------------------------------------------------------------ map
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var BASES_TILE = {
    light: { url: ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', max: 16, labels: true,
             attr: 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors' },
    imagery: { url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 17, labels: true,
               attr: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
    terrain: { url: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', max: 16, labels: false,
               attr: 'Tiles &copy; Esri, USGS, NOAA' }
  };
  var LABEL_TILE = ESRI + 'Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}';

  function setBase(key) {
    activeBase = BASES_TILE[key] ? key : 'light';
    localStorage.setItem('atlas.base', activeBase);
    Object.keys(baseLayers).forEach(function (k) {
      if (map.hasLayer(baseLayers[k])) map.removeLayer(baseLayers[k]);
    });
    if (!baseLayers[activeBase]) {
      var cfg = BASES_TILE[activeBase];
      baseLayers[activeBase] = L.tileLayer(cfg.url, { attribution: cfg.attr, maxZoom: cfg.max });
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
      localStorage.setItem('atlas.labels', showLabels ? 'on' : 'off');
      lab.classList.toggle('on', showLabels);
      rerender(true);
    });
  }

  function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 5 }).setView([34.2, 71.8], 7);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.on('zoomend moveend', updateLabels);
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
    if (districtLayer) districtLayer.setStyle(function (f) {
      return styleFor(f.properties._st || f.properties.status, state.level !== 'province');
    });
  }
  function fit(bounds, pad) {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [pad, pad], animate: !firstFit, duration: 0.5 });
    firstFit = false;
  }
  function styleFor(status, dim) {
    var dark = activeBase === 'imagery';
    return { color: dark ? '#0f141b' : '#ffffff', weight: dim ? 0.7 : 1.1, opacity: dim ? 0.6 : 1,
             fillColor: COLORS[status] || COLORS.nodata, fillOpacity: dim ? 0.2 : (dark ? 0.62 : 0.8) };
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
  function quantiles(values) {
    var v = values.filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    return [0.2, 0.4, 0.6, 0.8].map(function (q) { return v[Math.min(v.length - 1, Math.floor(q * v.length))]; });
  }
  function haColor(value, breaks) {
    if (value == null || !breaks) return COLORS.nodata;
    for (var i = 0; i < breaks.length; i++) if (value <= breaks[i]) return RAMP[i];
    return RAMP[4];
  }
  function tooltip(title, sub) {
    return '<b>' + title + '</b><br><span class="tt-sub">' + sub + '</span>';
  }

  function drawDistricts(statusById) {
    if (districtLayer) map.removeLayer(districtLayer);
    resetLabels();
    var detailed = state.level !== 'province' || state.detail;
    var dim = detailed;
    districtLayer = L.geoJSON(districts, {
      style: function (f) { return styleFor(statusById ? statusById[f.properties.district_id] : f.properties.status, dim); },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        p._st = statusById ? statusById[p.district_id] : p.status;
        if (!dim) {
          var def = isLatest() ? p.deficit_mm : null;
          addLabel(layer, '<span class="ml-n">' + nameOf(p) + '</span>' +
            (def != null ? '<span class="ml-v">' + Math.round(def) + ' ' + t('mm') + '</span>' : ''));
          hoverable(layer, function () { return styleFor(p._st, false); });
        }
        layer.on('click', function () { openDistrict(p.district_id); });
      }
    }).addTo(map);
    if (dim && ucLayer) ucLayer.bringToFront();
    updateLabels();
  }

  function drawUCs(fc, statusById) {
    if (ucLayer) map.removeLayer(ucLayer);
    var breaks = state.layer !== 'status'
      ? quantiles(fc.features.map(function (f) { return f.properties[state.layer]; })) : null;
    /* eslint-disable no-unused-vars */
    ucLayer = L.geoJSON(fc, {
      style: function (f) {
        var p = f.properties;
        if (state.layer === 'status') return styleFor(statusById ? statusById[p.uc_id] : p.status, false);
        return { color: '#ffffff', weight: 1.1, fillColor: haColor(p[state.layer], breaks), fillOpacity: 0.88 };
      },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        var st = statusById ? statusById[p.uc_id] : p.status;
        var val = state.layer === 'status'
          ? (isLatest() && p.deficit_mm != null ? Math.round(p.deficit_mm) + ' ' + t('mm') : '')
          : (p[state.layer] == null ? '' : fmtInt(p[state.layer]) + ' ' + t('ha'));
        addLabel(layer, '<span class="ml-n">' + p.uc_name_en + '</span>' +
          (val ? '<span class="ml-v">' + val + '</span>' : ''));
        var base = function () {
          if (state.layer === 'status') return styleFor(st, false);
          return { color: activeBase === 'imagery' ? '#0f141b' : '#ffffff', weight: 1.1,
                   fillColor: haColor(p[state.layer], breaks), fillOpacity: 0.88 };
        };
        hoverable(layer, base);
        layer.on('click', function () { openUC(p.district_id, p.uc_id); });
        if (state.ucId === p.uc_id) layer.setStyle({ color: '#0f141b', weight: 2.8, fillOpacity: 0.92 });
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

  // ------------------------------------------------------------------ legend
  function renderLegend(breaks) {
    var box = qs('legend');
    box.className = 'legend' + (legendOpen ? '' : ' closed');
    box.innerHTML = '';
    var showStatus = state.layer === 'status' || state.level === 'province';
    var head = el('button', { 'class': 'legend-head', type: 'button', onclick: function () {
      legendOpen = !legendOpen;
      localStorage.setItem('atlas.legend', legendOpen ? 'open' : 'closed');
      renderLegend(breaks);
    } }, [
      icon(showStatus ? 'droplet' : 'layers'),
      el('b', { text: showStatus ? t('legend_title') : t('layer_' + state.layer) }),
      icon('chevron-right', 'caret icon-sm')
    ]);
    box.appendChild(head);
    var body = el('div', { 'class': 'legend-body' });
    if (showStatus) {
      var max = meta.thresholds.amber.max_deficit_mm;
      [['green', t('legend_green')], ['amber', t('legend_amber', { max: max })],
       ['red', t('legend_red', { max: max })], ['nodata', t('legend_nodata')]].forEach(function (r) {
        body.appendChild(el('div', { 'class': 'legend-row' }, [
          el('span', { 'class': 'sw', style: 'background:' + COLORS[r[0]] }), el('span', { text: r[1] })]));
      });
      body.appendChild(el('div', { 'class': 'legend-note' }, [
        document.createTextNode(t('legend_note', { basis: t('basis_' + (meta.status_basis === 'cropland' ? 'cropland' : 'irrigated')) }) + ' '),
        el('a', { href: 'guide.html', text: t('legend_learn') })]));
    } else {
      body.appendChild(el('div', { 'class': 'ramp' }));
      body.appendChild(el('div', { 'class': 'ramp-labels' }, [
        el('span', { text: '0' }), el('span', { text: fmtInt(breaks && breaks[3]) + '+ ' + t('ha') })]));
      body.appendChild(el('div', { 'class': 'legend-note', text: t('layer_note') }));
    }
    box.appendChild(body);
  }

  // ------------------------------------------------------------------ province
  function openProvince() {
    state.level = 'province'; state.districtId = null; state.ucId = null; state.layer = 'status';
    if (ucLayer) { map.removeLayer(ucLayer); ucLayer = null; }
    setLoading(true);
    statusesFor(districts.features, 'district_id').then(function (st) {
      provinceStatuses = st;
      state.detail = map.getZoom() >= DETAIL_ZOOM;
      drawDistricts(st);
      fit(districtLayer.getBounds(), 12);
      renderLegend();
      renderProvince(st);
      showPanel(window.innerWidth > 820);
      setLoading(false);
      syncDetail();
    });
    history.replaceState(null, '', '#');
  }

  function renderProvince(statusById) {
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

    inner.appendChild(el('h2', {}, [icon('chart'), document.createTextNode(t('trend_title'))]));
    var trend = el('div', { 'class': 'chart', style: 'height:180px' });
    inner.appendChild(trend);
    provinceTrend(trend);

    inner.appendChild(el('h2', {}, [icon('map'), document.createTextNode(t('districts_title', { n: districts.features.length }))]));
    inner.appendChild(searchBox());
    var rows = districts.features.slice().sort(function (a, b) {
      return (b.properties.deficit_mm == null ? -1e9 : b.properties.deficit_mm)
           - (a.properties.deficit_mm == null ? -1e9 : a.properties.deficit_mm);
    }).filter(matchQuery(function (p) { return nameOf(p) + ' ' + p.name_en; }));
    var list = el('ul', { 'class': 'list' });
    rows.forEach(function (f) {
      var p = f.properties, st = statusById ? statusById[p.district_id] : p.status;
      var row = listRow(COLORS[st], nameOf(p),
        isLatest() && p.deficit_mm != null ? fmtMm(p.deficit_mm) + ' ' + t('mm') : '',
        function () { openDistrict(p.district_id); });
      list.appendChild(row);
      movement(p.district_id, row);
    });
    if (!rows.length) list.appendChild(el('li', { 'class': 'hint', text: t('no_match') }));
    inner.appendChild(list);
    inner.appendChild(el('p', { 'class': 'hint', text: t('tap_district') }));
    var hint = detailHint();
    if (hint) inner.appendChild(hint);
    inner.appendChild(sourcesBlock());
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
            barmode: 'stack', height: 180, margin: { l: 30, r: 8, t: 4, b: 26 },
            legend: { orientation: 'h', y: 1.3, x: 0, font: { size: 10 } },
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
        if (!keepView && ucLayer.getLayers().length) fit(ucLayer.getBounds(), 24);
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
      el('button', { onclick: openProvince }, [icon('chevron-left', 'icon-sm'), document.createTextNode(t('province'))]),
      el('span', { 'class': 'here', text: nameOf(p) })]));
    inner.appendChild(el('div', { 'class': 'title-row' }, [el('h1', { text: nameOf(p) })]));
    inner.appendChild(el('p', { 'class': 'sub', text: t('district_sub', { n: fc.features.length }) }));

    inner.appendChild(statusCard(currentFor(dser, p), p));
    inner.appendChild(el('h2', {}, [icon('sprout'), document.createTextNode(t('land_title'))]));
    inner.appendChild(hectares(p));
    if (!hasCropType()) inner.appendChild(cropTypeNotice());

    inner.appendChild(el('h2', {}, [icon('layers'), document.createTextNode(t('layers'))]));
    var chips = el('div', { 'class': 'chips' });
    chips.appendChild(el('button', {
      'class': 'chip' + (state.layer === 'status' ? ' on' : ''), type: 'button',
      onclick: function () { state.layer = 'status'; openDistrict(p.district_id, true); }
    }, [icon('droplet', 'icon-sm'), document.createTextNode(t('layer_status'))]));
    HA_LAYERS.forEach(function (L2) {
      var available = fc.features.some(function (f) { return f.properties[L2.key] != null; });
      chips.appendChild(el('button', {
        'class': 'chip' + (state.layer === L2.key ? ' on' : ''), type: 'button',
        disabled: available ? null : 'disabled',
        title: available ? null : t('not_connected'),
        onclick: function () { state.layer = L2.key; openDistrict(p.district_id, true); }
      }, [icon(L2.icon, 'icon-sm'), document.createTextNode(t('layer_' + L2.key))]));
    });
    inner.appendChild(chips);

    inner.appendChild(el('h2', {}, [icon('chart'), document.createTextNode(t('chart_title'))]));
    var dchart = el('div', { 'class': 'chart' });
    inner.appendChild(dchart);
    renderChart(dchart, dser);

    inner.appendChild(el('h2', {}, [icon('map'), document.createTextNode(t('ucs_title', { n: fc.features.length }))]));
    inner.appendChild(searchBox());
    var rows = fc.features.slice().sort(function (a, b) {
      return (b.properties.deficit_mm == null ? -1e9 : b.properties.deficit_mm)
           - (a.properties.deficit_mm == null ? -1e9 : a.properties.deficit_mm);
    }).filter(matchQuery(function (q) { return q.uc_name_en; }));
    var list = el('ul', { 'class': 'list' });
    rows.forEach(function (f) {
      var u = f.properties, st = statusById ? statusById[u.uc_id] : u.status;
      var val = state.layer === 'status'
        ? (isLatest() && u.deficit_mm != null ? fmtMm(u.deficit_mm) + ' ' + t('mm') : '')
        : (u[state.layer] == null ? t('not_connected') : fmtInt(u[state.layer]) + ' ' + t('ha'));
      var row = listRow(COLORS[st], u.uc_name_en, val, function () { openUC(u.district_id, u.uc_id); },
        state.layer !== 'status' && u[state.layer] == null);
      list.appendChild(row);
      if (state.layer === 'status') movement(u.uc_id, row);
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
        drawUCs(fc, st);
        renderLegend();
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
      el('button', { onclick: openProvince }, [icon('chevron-left', 'icon-sm'), document.createTextNode(t('province'))]),
      icon('chevron-right', 'icon-sm'),
      el('button', { onclick: function () { openDistrict(p.district_id); } }, [document.createTextNode(nameOf(p))]),
      el('span', { 'class': 'here', text: p.uc_name_en })]));
    inner.appendChild(el('div', { 'class': 'title-row' }, [el('h1', { text: p.uc_name_en })]));
    inner.appendChild(el('p', { 'class': 'sub', text: t('uc_sub', { district: nameOf(p) }) }));

    inner.appendChild(statusCard(currentFor(ser, p), p));
    inner.appendChild(trendLine(ser));

    inner.appendChild(el('h2', {}, [icon('sprout'), document.createTextNode(t('land_title'))]));
    inner.appendChild(hectares(p));
    if (!hasCropType()) inner.appendChild(cropTypeNotice());

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
    card.appendChild(body);
    return card;
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
    HA_LAYERS.forEach(function (L2) {
      var v = p[L2.key], has = v != null;
      grid.appendChild(el('div', { 'class': 'stat' + (has ? '' : ' empty') }, [
        el('div', { 'class': 'k' }, [icon(L2.icon, 'icon-sm'), document.createTextNode(t('layer_' + L2.key))]),
        has ? el('div', { 'class': 'v num' }, [document.createTextNode(fmtInt(v)), el('small', { text: ' ' + t('ha') })])
            : el('div', { 'class': 'v', text: t('not_connected') })]));
    });
    return grid;
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
      s.src = 'https://cdn.plot.ly/plotly-basic-2.35.2.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return plotlyPromise;
  }
  function renderChart(node, ser) {
    if (!ser) { node.replaceWith(el('p', { 'class': 'hint', text: t('no_series') })); return; }
    var x = ser.dekads.map(function (d) { return fmtDate(d.start); });
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
      ], {
        barmode: 'group', height: 236, margin: { l: 38, r: 10, t: 6, b: 30 },
        legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 11 } },
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
    var rows = [['id', 'name', 'dekad_start', 'dekad_end', 'water_needed_mm', 'rain_mm', 'deficit_mm', 'status']];
    (ser ? ser.dekads : []).forEach(function (d) {
      rows.push([id, label, d.start, d.end, d.et_mm, d.rain_mm, d.deficit_mm, d.status]);
    });
    rows.push([]);
    rows.push(['# method', ser ? ser.et_method : meta.et_method]);
    rows.push(['# sources', ser ? Object.keys(ser.sources).map(function (k) { return k + ': ' + ser.sources[k]; }).join(' | ') : '']);
    rows.push(['# generated_at', (ser && ser.generated_at) || meta.generated_at]);
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        return c == null ? '' : /[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'kp-atlas-' + id + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------------ language, boot
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = (state.lang === 'ur' || state.lang === 'ps') ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    document.title = t('app_title');
    qs('langSelect').value = state.lang;
    localStorage.setItem('atlas.lang', state.lang);
    fillDekads();
    qs('footGenerated').textContent = t('generated', { ts: stamp(meta.generated_at) });
    qs('footSources').textContent = t('footer_sources');
    qs('mapToggleLabel').textContent = document.body.classList.contains('show-map') ? t('show_details') : t('show_map');
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
    Promise.all([
      getJSON('meta.json', Math.floor(Date.now() / 3.6e6)),
      fetch('strings.json?v=' + Math.floor(Date.now() / 3.6e6)).then(function (r) { return r.json(); })
        .catch(function () { return fromSnapshot('strings.json'); })
    ]).then(function (res) {
      meta = res[0]; strings = res[1];
      state.dekadIndex = meta.dekads.length - 1;
      qs('demoBadge').hidden = meta.mode === 'live';
      return getJSON('districts.geojson');
    }).then(function (fc) {
      districts = fc;
      buildMapControls();
      applyLang();
      qs('langSelect').addEventListener('change', function (e) { state.lang = e.target.value; applyLang(); rerender(true); });
      qs('dekadSelect').addEventListener('change', function (e) { state.dekadIndex = Number(e.target.value); rerender(true); });
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
      qs('panel').innerHTML = '<div class="panel-inner"><h1>Could not load the data files</h1>' +
        '<p class="hint">' + err.message + '</p>' +
        '<p class="hint">This page needs the <code>data/</code> folder beside it. From a clone:</p>' +
        '<pre style="white-space:pre-wrap">./scripts/serve.sh</pre>' +
        '<p class="hint">For a deployment, build first and serve the result:</p>' +
        '<pre style="white-space:pre-wrap">./scripts/build-site.sh\npython3 -m http.server -d _site 8000</pre>' +
        '<p class="hint">Publishing <code>site/</code> on its own will not work, because the data lives outside it.</p></div>';
    });
  }
  boot();
})();
