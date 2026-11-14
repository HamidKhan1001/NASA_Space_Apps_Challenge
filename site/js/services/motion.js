/* Motion service: a thin, reduced-motion-aware wrapper over Anime.js.
   If Anime.js is absent (failed to load) or the user prefers reduced motion,
   every call is a no-op, so the UI still renders correctly without animation.
   Anime.js is vendored at site/vendor/anime.min.js (see AGENTS.md). */
window.Atlas = window.Atlas || {};

Atlas.motion = (function () {
  'use strict';

  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function enabled() { return !reduced && typeof window.anime === 'function'; }

  // Fade/slide an element in when it is (re)rendered.
  function reveal(target, opts) {
    if (!enabled() || !target) return;
    opts = opts || {};
    window.anime({
      targets: target,
      opacity: [0, 1],
      translateY: [opts.y != null ? opts.y : 8, 0],
      duration: opts.duration != null ? opts.duration : 260,
      easing: 'easeOutQuad'
    });
  }

  // A brief scale pulse for a value that just changed.
  function pulse(target) {
    if (!enabled() || !target) return;
    window.anime({
      targets: target,
      scale: [1, 1.04, 1],
      duration: 320,
      easing: 'easeOutQuad'
    });
  }

  return { reveal: reveal, pulse: pulse, reduced: reduced };
})();
