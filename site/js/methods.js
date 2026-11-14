/* Renders docs/methods.md and the census-versus-atlas comparison from data/validation.csv. */
(function () {
  'use strict';
  var v = Math.floor(Date.now() / 3.6e6);

  fetch('docs/methods.md?v=' + v)
    .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error(r.status)); })
    .then(function (md) { document.getElementById('methods').innerHTML = marked.parse(md); })
    .catch(function () {
      document.getElementById('methods').innerHTML =
        '<h1>Methods</h1><p class="muted">docs/methods.md was not found next to this page. ' +
        'Serve the site with scripts/serve.sh, or read it in the repository.</p>';
    });

  fetch('data/meta.json?v=' + v).then(function (r) { return r.json(); }).then(function (meta) {
    var method = meta.et_method === 'wapor_aeti'
      ? 'FAO WaPOR actual evapotranspiration'
      : 'FAO-56 Penman-Monteith from NASA POWER';
    document.getElementById('generated').textContent =
      'Data generated ' + String(meta.generated_at).replace('T', ' ').replace('Z', ' UTC') +
      ' · mode: ' + meta.mode + ' · water demand: ' + method + ' · signal computed on ' + meta.status_basis;
  }).catch(function () {});

  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/);
    var head = lines.shift().split(',');
    return lines.map(function (l) {
      var c = l.split(','), o = {};
      head.forEach(function (h, i) { o[h] = c[i]; });
      return o;
    });
  }
  function pearson(xs, ys) {
    var n = xs.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    return sxy / Math.sqrt(sxx * syy);
  }
  function num(x) { return x === '' || x == null ? '' : Number(x).toLocaleString('en-US'); }

  fetch('data/validation.csv?v=' + v).then(function (r) { return r.text(); }).then(function (text) {
    var rows = parseCSV(text);
    var pairs = rows.filter(function (r) { return r.census_crop_ha && r.atlas_crop_ha; });
    var note = document.getElementById('validationNote');
    var tbl = document.getElementById('validationTable');
    tbl.innerHTML = '<tr><th>District</th><th>Census cropped (ha)</th><th>Atlas cropland (ha)</th>' +
      '<th>Ratio</th></tr>' + rows.map(function (r) {
        var ratio = r.census_crop_ha && r.atlas_crop_ha
          ? (Number(r.atlas_crop_ha) / Number(r.census_crop_ha)).toFixed(2) : '';
        return '<tr><td>' + r.district + '</td><td>' +
          (r.census_crop_ha ? num(r.census_crop_ha) : '<span class="muted">not entered</span>') +
          '</td><td>' + num(r.atlas_crop_ha) + '</td><td>' + ratio + '</td></tr>';
      }).join('');

    if (pairs.length < 3) {
      note.textContent = 'The census column is not filled in yet. Type the district rows into ' +
        'pipeline/census_2024.csv and the scatter, the correlation and the outliers appear here ' +
        'automatically. Until then the cropland figures below are published unvalidated, and the ' +
        'table lets anyone check them against their own source.';
      document.getElementById('scatter').style.display = 'none';
      return;
    }
    var xs = pairs.map(function (r) { return Number(r.census_crop_ha); });
    var ys = pairs.map(function (r) { return Number(r.atlas_crop_ha); });
    var r = pearson(xs, ys);
    var max = Math.max.apply(null, xs.concat(ys));
    var worst = pairs.map(function (p, i) {
      return { d: p.district, e: Math.abs(ys[i] - xs[i]) / Math.max(1, xs[i]) };
    }).sort(function (a, b) { return b.e - a.e; }).slice(0, 3).map(function (x) { return x.d; });
    note.textContent = 'Cropped area per district, census on the horizontal axis against this atlas on ' +
      'the vertical. Pearson r = ' + r.toFixed(2) + ' over ' + pairs.length + ' districts. ' +
      'Largest disagreement: ' + worst.join(', ') + '.';
    Plotly.newPlot('scatter', [
      { type: 'scatter', mode: 'markers+text', x: xs, y: ys,
        text: pairs.map(function (p) { return p.district; }), textposition: 'top center',
        textfont: { size: 10 }, marker: { size: 9, color: '#0b3d91' }, name: 'District' },
      { type: 'scatter', mode: 'lines', x: [0, max], y: [0, max],
        line: { color: '#94a3b8', dash: 'dot' }, name: '1:1 line' }
    ], {
      margin: { l: 66, r: 20, t: 10, b: 52 },
      xaxis: { title: 'Census cropped area (ha)', gridcolor: '#eef1f6' },
      yaxis: { title: 'Atlas cropland (ha)', gridcolor: '#eef1f6' },
      legend: { orientation: 'h' }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, system-ui, sans-serif', color: '#39414d' }
    }, { displayModeBar: false, responsive: true });
  }).catch(function () {});
})();
