/* Renders docs/methods.md and the census-vs-atlas validation scatter from data/validation.csv. */
(function () {
  'use strict';
  var v = Math.floor(Date.now() / 3.6e6);

  fetch('docs/methods.md?v=' + v).then(function (r) { return r.ok ? r.text() : Promise.reject(new Error(r.status)); })
    .then(function (md) { document.getElementById('methods').innerHTML = marked.parse(md); })
    .catch(function () { document.getElementById('methods').innerHTML = '<p class="muted">Methods text not found (docs/methods.md).</p>'; });

  fetch('data/meta.json?v=' + v).then(function (r) { return r.json(); }).then(function (meta) {
    document.getElementById('generated').textContent = 'Data generated ' + meta.generated_at + ' · mode: ' + meta.mode;
  }).catch(function () {});

  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/), head = lines.shift().split(',');
    return lines.map(function (l) { var c = l.split(','), o = {}; head.forEach(function (h, i) { o[h] = c[i]; }); return o; });
  }
  function pearson(xs, ys) {
    var n = xs.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    return sxy / Math.sqrt(sxx * syy);
  }

  fetch('data/validation.csv?v=' + v).then(function (r) { return r.text(); }).then(function (text) {
    var rows = parseCSV(text);
    var pairs = rows.filter(function (r) { return r.census_crop_ha && r.atlas_crop_ha; });
    var note = document.getElementById('validationNote');
    var tbl = document.getElementById('validationTable');
    tbl.innerHTML = '<tr><th>District</th><th>Census cropped (ha)</th><th>Atlas cropland (ha)</th><th>Census wheat (ha)</th><th>Atlas winter cereals (ha)</th><th>Ratio (atlas/census)</th></tr>' +
      rows.map(function (r) {
        var ratio = r.census_crop_ha && r.atlas_crop_ha ? (Number(r.atlas_crop_ha) / Number(r.census_crop_ha)).toFixed(2) : '';
        return '<tr><td>' + r.district + '</td><td>' + (r.census_crop_ha || '<span class="muted">not entered</span>') + '</td><td>' + Number(r.atlas_crop_ha).toLocaleString('en-US') + '</td><td>' + (r.census_wheat_ha || '') + '</td><td>' + Number(r.atlas_wheat_ha).toLocaleString('en-US') + '</td><td>' + ratio + '</td></tr>';
      }).join('');
    if (pairs.length < 3) {
      note.textContent = 'Census rows have not been entered yet (pipeline/census_2024.csv). The scatter appears once at least three districts have census values. Until then the atlas numbers below are unvalidated.';
      document.getElementById('scatter').style.display = 'none';
      return;
    }
    var xs = pairs.map(function (r) { return Number(r.census_crop_ha); }), ys = pairs.map(function (r) { return Number(r.atlas_crop_ha); });
    var r = pearson(xs, ys), max = Math.max.apply(null, xs.concat(ys));
    var resid = pairs.map(function (p, i) { return { d: p.district, e: Math.abs(ys[i] - xs[i]) / Math.max(1, xs[i]) }; }).sort(function (a, b) { return b.e - a.e; }).slice(0, 3).map(function (x) { return x.d; });
    note.textContent = 'Cropped area per district, 2024 Census (x) against this atlas (y). Pearson r = ' + r.toFixed(2) + ' over ' + pairs.length + ' districts. Largest relative disagreement: ' + resid.join(', ') + '.';
    Plotly.newPlot('scatter', [
      { type: 'scatter', mode: 'markers+text', x: xs, y: ys, text: pairs.map(function (p) { return p.district; }), textposition: 'top center', textfont: { size: 10 }, marker: { size: 9, color: '#2e7d32' }, name: 'District' },
      { type: 'scatter', mode: 'lines', x: [0, max], y: [0, max], line: { color: '#9e9e9e', dash: 'dot' }, name: '1:1 line' }
    ], { margin: { l: 60, r: 20, t: 10, b: 50 }, xaxis: { title: 'Census 2024 cropped area (ha)' }, yaxis: { title: 'Atlas cropland (ha)' }, legend: { orientation: 'h' } }, { displayModeBar: false, responsive: true });
  });
})();
