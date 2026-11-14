/* Inline SVG icon sprite. Injected on load so it also works from file:// in the
   offline demo. Icons are 24x24, stroke currentColor, drawn for this project:
   crop and water symbols rather than generic app glyphs. */
(function () {
  'use strict';
  var S = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">' +
    sym('globe', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/>') +
    sym('calendar', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>') +
    sym('book', '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v16H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M4 17.5A1.5 1.5 0 0 1 5.5 16H19"/><path d="M8 7.5h7M8 11h5"/>') +
    sym('beaker', '<path d="M9 3h6M10 3v6.2L4.8 18A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.2 15h9.6"/>') +
    sym('droplet', '<path d="M12 3.2C12 3.2 5.5 10 5.5 14.2a6.5 6.5 0 0 0 13 0C18.5 10 12 3.2 12 3.2Z"/>') +
    sym('rain', '<path d="M7 16a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17.5 16"/><path d="M8.5 19l-.8 2M12 19l-.8 2M15.5 19l-.8 2"/>') +
    sym('sprout', '<path d="M12 21v-7"/><path d="M12 14C12 9.6 9 7 5 7c0 4.4 3 7 7 7Z"/><path d="M12 14c0-3.6 2.5-6 6-6 0 3.6-2.5 6-6 6Z"/>') +
    sym('wheat', '<path d="M12 21V9"/><path d="M12 9c0-2 1-3.4 2.6-4.3C15.4 6.6 14.6 8.4 12 9Zm0 0c0-2-1-3.4-2.6-4.3C8.6 6.6 9.4 8.4 12 9Z"/><path d="M12 14c0-2 1-3.4 2.6-4.3 0.8 1.9 0 3.7-2.6 4.3Zm0 0c0-2-1-3.4-2.6-4.3-.8 1.9 0 3.7 2.6 4.3Z"/><path d="M12 19c0-2 1-3.4 2.6-4.3.8 1.9 0 3.7-2.6 4.3Zm0 0c0-2-1-3.4-2.6-4.3-.8 1.9 0 3.7 2.6 4.3Z"/>') +
    sym('maize', '<path d="M12 21c-3 0-5-2.4-5-6.5S9 3.5 12 3.5s5 6.9 5 11S15 21 12 21Z"/><path d="M12 4.5v16M9 8.5h6M9 12.5h6M9 16.5h6"/>') +
    sym('irrigation', '<path d="M4 20h16"/><path d="M7 20v-5M12 20V9M17 20v-5"/><path d="M12 9c-1.6-1.2-2.4-2.8-2.4-4.6C11.4 5 12.6 6.4 12 9Z"/><path d="M5.4 15c-.9-.7-1.4-1.6-1.4-2.7 1.1.3 1.8 1.1 1.4 2.7Z"/><path d="M18.6 15c.9-.7 1.4-1.6 1.4-2.7-1.1.3-1.8 1.1-1.4 2.7Z"/>') +
    sym('chart', '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="11" width="3" height="6" rx=".6"/><rect x="12.5" y="7" width="3" height="10" rx=".6"/><path d="M8.5 9 14 5.5l5 2"/>') +
    sym('download', '<path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>') +
    sym('layers', '<path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="m4.5 12 7.5 4 7.5-4"/><path d="m4.5 16.5 7.5 4 7.5-4"/>') +
    sym('search', '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>') +
    sym('chevron-right', '<path d="m9.5 5 7 7-7 7"/>') +
    sym('chevron-left', '<path d="m14.5 5-7 7 7 7"/>') +
    sym('map', '<path d="m9 4.5 6 3 5-2.5v14l-5 2.5-6-3-5 2.5v-14l5-2.5Z"/><path d="M9 4.5v14M15 7.5v14"/>') +
    sym('info', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>') +
    sym('close', '<path d="m6 6 12 12M18 6 6 18"/>') +
    sym('satellite', '<path d="m9 9-4 4 2.5 2.5 4-4"/><path d="m13.5 4.5 6 6-3.5 3.5-6-6z"/><path d="M8 16.5 4.5 20"/><path d="M15 17a4.5 4.5 0 0 0 4.5-4.5M15 20.5a8 8 0 0 0 8-8"/>') +
    sym('alert', '<path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/>') +
    sym('check', '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.7"/>') +
    sym('external', '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>') +
    sym('play', '<path d="M8 5.5v13l11-6.5z"/>') +
    sym('pause', '<path d="M9 5v14M15 5v14"/>') +
    sym('refresh', '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5"/><path d="M20 20v-4.5h-4.5"/>') +
    '</svg>';

  function sym(id, body) {
    return '<symbol id="i-' + id + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</symbol>';
  }

  function inject() {
    var holder = document.createElement('div');
    holder.innerHTML = S;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();

  // helper used by app.js and guide.js
  window.atlasIcon = function (name, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  };
})();
