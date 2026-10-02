// Decides when each post is looked at: watches the page for posts, scores them as they near
// the screen, and re-decides the page when a setting, the block list, or the model changes.
(() => {
  const { MODE, MODEL_STATE, STORE, DEFAULTS } = globalThis.ANUBIS;
  const content = globalThis.ANUBIS_CONTENT;
  const SITE = globalThis.ANUBIS_SITE;
  const STATS = globalThis.ANUBIS_STATS;
  const { DATA, ANIMATION, PRELOAD_MARGIN, STAGE_MARGIN, SETTING_KEYS } = content.config;
  const { settings, results, animated, awaitingStage, bars, animating, seen } = content.state;
  const { resultFor, isTooShort } = content.results;
  const { render, renderError, clear } = content.chip;
  const { playInspection } = content.animation;

  // Animated mode inspects a post once. A post already scored and shown under
  // another mode is left as it is.
  const wantsInspection = (post) =>
    settings.mode === MODE.ANIMATED && !animated.has(post.id) && !results.has(post.id);

  async function process(el) {
    if (animating.has(el)) return;
    const post = SITE.extract(el);
    if (!post) return;
    // Saved with every label.
    post.site = SITE.name;

    // Sites reuse nodes while scrolling, so a node can change posts.
    if (el.dataset[DATA.ID] !== post.id) {
      clear(el);
      el.dataset[DATA.ID] = post.id;
    }
    if (isTooShort(post.text)) return;

    if (wantsInspection(post)) {
      awaitingStage.set(el, post);
      stage.observe(el);
      return;
    }

    try {
      const result = await resultFor(post);
      // The node may have been reused for another post while waiting.
      if (el.dataset[DATA.ID] === post.id) render(el, post, result);
    } catch (error) {
      if (el.dataset[DATA.ID] === post.id) renderError(el, error);
    }
  }

  function enterStage(el, delayMs) {
    const post = awaitingStage.get(el);
    awaitingStage.delete(el);
    stage.unobserve(el);
    if (!post || el.dataset[DATA.ID] !== post.id) return;
    if (!wantsInspection(post)) {
      process(el);
      return;
    }
    animated.add(post.id);
    playInspection(el, post, delayMs);
  }

  const stage = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        .forEach((entry, index) => enterStage(entry.target, index * ANIMATION.STAGGER_MS));
    },
    { rootMargin: STAGE_MARGIN },
  );

  const viewport = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) process(entry.target);
    },
    { rootMargin: PRELOAD_MARGIN },
  );

  function scan() {
    for (const el of document.querySelectorAll(SITE.itemSelector)) {
      if (!seen.has(el)) {
        seen.add(el);
        viewport.observe(el);
      } else if (el.dataset[DATA.ID]) {
        // Re-apply when the site re-rendered the node (bar gone) or reused it for another post.
        const lostBar = el.dataset[DATA.BAR] === 'true' && !bars.get(el)?.isConnected;
        const isStale = SITE.idOf(el) !== el.dataset[DATA.ID];
        if (lostBar || isStale) process(el);
      }
    }
  }

  function rerenderAll() {
    for (const el of document.querySelectorAll(SITE.itemSelector)) process(el);
  }

  // Only what changes a decision re-renders the page. The worker also writes a flag count on
  // every flagged post.
  function onStorageChanged(changes) {
    const touchedSettings = SETTING_KEYS.filter((key) => changes[key]);
    for (const key of touchedSettings) settings[key] = changes[key].newValue ?? DEFAULTS[key];
    const model = changes[STORE.MODEL_STATUS];
    const modelBecameReady = model?.newValue?.state === MODEL_STATE.READY && model.oldValue?.state !== MODEL_STATE.READY;
    if (!touchedSettings.length && !modelBecameReady && !changes[STORE.BLOCKED]) return;
    STATS.setEnabled(settings.stats);
    rerenderAll();
  }

  async function start() {
    let scanQueued = false;
    new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      requestAnimationFrame(() => {
        scanQueued = false;
        scan();
      });
    }).observe(document.body, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener(onStorageChanged);

    const stored = await chrome.storage.local.get(SETTING_KEYS);
    for (const key of SETTING_KEYS) if (stored[key] !== undefined) settings[key] = stored[key];
    STATS.setEnabled(settings.stats);
    scan();
  }

  content.scheduler = Object.freeze({ rerenderAll });
  start();
})();
