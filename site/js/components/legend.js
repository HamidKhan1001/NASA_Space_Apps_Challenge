/* Legend component: renders the map legend from metadata. It reads thresholds
   and breaks passed in by the controller and never computes status itself. */
window.Atlas = window.Atlas || {};
Atlas.components = Atlas.components || {};

Atlas.components.legend = (function () {
  'use strict';
  var el = Atlas.util.el;
  var t = function (k, v) { return Atlas.i18n.t(k, v); };
  var colors = Atlas.config.colors;

  // ctx: { node, level, layer, dekad, thresholds, breaks }
  function render(ctx) {
    var box = ctx.node;
    if (!box) return;
    box.innerHTML = '';
    var lang = Atlas.i18n.getLang();

    if (ctx.layer === 'status' || ctx.level === 'province') {
      box.appendChild(el('h3', { text: t('legend_title', { dekad: Atlas.util.dekadLabel(ctx.dekad, lang) }) }));
      var thr = ctx.thresholds;
      [
        ['green', t('legend_green')],
        ['amber', t('legend_amber', { max: thr.amber.max_deficit_mm })],
        ['red', t('legend_red', { max: thr.amber.max_deficit_mm })],
        ['nodata', t('legend_nodata')]
      ].forEach(function (r) {
        box.appendChild(el('div', { 'class': 'row' }, [
          el('span', { 'class': 'sw', style: 'background:' + colors[r[0]] }),
          el('span', { text: r[1] })
        ]));
      });
      box.appendChild(el('div', { 'class': 'note', text: t('legend_note') }));
    } else {
      box.appendChild(el('h3', { text: t('layer_' + ctx.layer) + ' \u00b7 ' + t('ha') }));
      box.appendChild(el('div', { 'class': 'ramp' }));
      box.appendChild(el('div', { 'class': 'ramp-labels' }, [
        el('span', { text: Atlas.util.fmtInt(0) }),
        el('span', { text: Atlas.util.fmtInt(ctx.breaks && ctx.breaks[3]) + '+' })
      ]));
      box.appendChild(el('div', { 'class': 'note', text: t('layer_note') }));
    }
  }

  return { render: render };
})();
