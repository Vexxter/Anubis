// Constants for the content-script modules. Content scripts are classic scripts and cannot
// import each other, so the modules share one registry, `globalThis.ANUBIS_CONTENT`. The load
// order is in manifest.json: config, state, results, chip, animation, scheduler.
(() => {
  const { MODE, STORE } = globalThis.ANUBIS;
  const content = (globalThis.ANUBIS_CONTENT ??= {});

  content.config = Object.freeze({
    CLASS: Object.freeze({
      BAR: 'anubis-bar',
      FLAGGED: 'anubis-flagged',
      OFFER: 'anubis-offer',
      BUTTON: 'anubis-button',
      // Label controls. Tucked away until the chip is hovered.
      EXTRA: 'anubis-extra',
      ACTIVE: 'anubis-active',
      SCANLINE: 'anubis-scanline',
      SCAN_UP: 'anubis-scan-up',
      FILL: 'anubis-fill',
      PASS: 'anubis-pass',
      FAIL: 'anubis-fail',
    }),
    // State on the site's own post element lives in data attributes. X rewrites the element's
    // whole class list on every hover, which wipes any class added here.
    DATA: Object.freeze({
      ID: 'anubisId',
      BAR: 'anubisBar',
      HIDE: 'anubisHide',
      ANIMATING: 'anubisAnimating',
    }),
    HIDE: Object.freeze({ COLLAPSE: 'collapse', DIM: 'dim' }),
    TEXT: Object.freeze({
      SHOW: 'Retrieve',
      HIDE: 'Exile',
      EXILED: 'Exiled to the Duat',
      LABEL_AI: 'AI',
      LABEL_HUMAN: 'Human',
      LABEL_PROMPT: 'Label:',
      BLOCK: 'Block',
      BLOCKED: 'Blocked',
      BLOCK_OFFER: (count, handle) => `${count} posts from ${handle} were exiled to the Duat. Block the account?`,
      BLOCK_YES: 'Block',
      BLOCK_NO: 'Not now',
    }),
    // The only storage keys a page re-decides on. See `onStorageChanged` in scheduler.js.
    SETTING_KEYS: Object.freeze([STORE.THRESHOLD, STORE.MODE, STORE.LABELING, STORE.STATS]),
    // The worker answers this while the model loads. Not a failure worth a log line.
    NOT_READY: globalThis.ANUBIS.NOT_READY,
    // Animated mode ends in the same collapsed state as collapse mode.
    COLLAPSING_MODES: new Set([MODE.COLLAPSE, MODE.ANIMATED]),
    // Too little text to judge. These are never scored or hidden.
    MIN_WORDS: 5,
    // Outside animated mode, posts are scored well before they scroll into view,
    // so flagged ones are already hidden when they arrive.
    PRELOAD_MARGIN: '800px 0px',
    // Animated mode scores a post when it is inside the top three quarters of the
    // viewport, so the scan on screen is the real wait for the model.
    STAGE_MARGIN: '0px 0px -25% 0px',
    ANIMATION: Object.freeze({
      // Posts that come on screen together start one after another, top first.
      STAGGER_MS: 150,
      // One trip of the scan line, top to bottom or back up. It bounces until the model
      // answers, and always finishes the first trip down.
      SCAN_PASS_MS: 1100,
      SCAN_FADE_MS: 200,
      VERDICT_FADE_MS: 400,
      PASS_HOLD_MS: 500,
      PASS_FADE_MS: 500,
      FAIL_HOLD_MS: 200,
      COLLAPSE_MS: 500,
      BAR_FADE_MS: 200,
      // Slows at the top and bottom, so the turn reads as a bounce.
      SCAN_EASING: 'ease-in-out',
      COLLAPSE_EASING: 'ease-in-out',
      // The shrink is done at this point of the collapse. The rest fades the red strip out.
      SHRINK_END_OFFSET: 0.8,
      // Height of the bar a collapsed post ends at, so the shrink lands on it.
      // Matches `min-height` of `.anubis-bar` in content.css.
      COLLAPSED_HEIGHT_PX: 28,
    }),
    SCAN_DOWN_FRAMES: Object.freeze([{ top: '0%' }, { top: '100%' }]),
    SCAN_UP_FRAMES: Object.freeze([{ top: '100%' }, { top: '0%' }]),
    ABORT_ERROR: 'AbortError',
  });
})();
