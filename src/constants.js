// Shared by the content script (classic script) and the background worker (module),
// so it attaches to globalThis instead of exporting.
globalThis.ANUBIS = Object.freeze({
  MSG: Object.freeze({
    CLASSIFY: 'anubis/classify',
    LABEL: 'anubis/label',
    IS_BLOCKED: 'anubis/is-blocked',
    BLOCK: 'anubis/block',
    UNBLOCK: 'anubis/unblock',
    BLOCKED_LIST: 'anubis/blocked-list',
    // Worker <-> offscreen document, which runs the model.
    SCORE: 'anubis/score',
    MODEL_START: 'anubis/model-start',
    MODEL_STATUS: 'anubis/model-status',
  }),
  STORE: Object.freeze({
    THRESHOLD: 'threshold',
    MODE: 'mode',
    LABELING: 'labeling',
    STATS: 'stats',
    MODEL_STATUS: 'modelStatus',
    LABELS: 'labels',
    BLOCKED: 'blocked',
    FLAG_COUNTS: 'flagCounts',
  }),
  // The worker answers a score request with this error code while the model is still loading.
  NOT_READY: 'not-ready',
  // Keys the score cache: bump it whenever model/ or assets/probe.json change.
  MODEL_VERSION: 'laya-mm-int8-v1',
  MODEL_STATE: Object.freeze({
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error',
  }),
  MODE: Object.freeze({
    COLLAPSE: 'collapse',
    ANIMATED: 'animated',
    DIM: 'dim',
    BADGE: 'badge',
  }),
  LABEL: Object.freeze({ AI: 1, HUMAN: 0 }),
  // Flagged posts from one account before the extension offers to block it.
  BLOCK_AFTER_FLAGS: 3,
  DEFAULTS: Object.freeze({
    threshold: 0.75,
    mode: 'collapse',
    labeling: true,
    stats: false,
  }),
});
