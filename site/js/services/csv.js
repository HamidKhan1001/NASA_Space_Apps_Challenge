/* CSV export helper: turns a matrix of rows into a quoted, BOM-prefixed file
   and triggers a download. Values are written exactly as given, so callers
   must already represent missing data as empty strings. */
window.Atlas = window.Atlas || {};

Atlas.csv = (function () {
  'use strict';

  function cell(c) {
    if (c == null) return '';
    var s = String(c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    return rows.map(function (r) { return r.map(cell).join(','); }).join('\n');
  }

  function download(filename, rows) {
    var csv = toCsv(rows);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return { toCsv: toCsv, download: download };
})();
