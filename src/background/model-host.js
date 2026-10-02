// Where the model lives and how the worker reaches it. Chrome runs it in an offscreen document
// (src/offscreen.js); Firefox has none, so the background page runs it itself
// (src/model-runner.js). Either way the worker sees the same three calls: `startModel`,
// `requireReady` and `modelScore`.
import '../constants.js';

const { MSG, STORE, MODEL_STATE, NOT_READY } = globalThis.ANUBIS;

const OFFSCREEN_URL = 'src/offscreen.html';
// After a failed start, wait this long before trying to load the model again.
const RETRY_AFTER_ERROR_MS = 60_000;

const hasOffscreen = typeof chrome.offscreen?.createDocument === 'function';

let modelState = null; // what the model last reported; null until it has
let lastError = { at: 0, message: '' };
let creating = null;

// The worker restarts often and forgets `modelState`, but the offscreen document and its
// loaded model live on. The last report is in storage. A stale one is harmless: "ready" with
// the model gone just makes the next score load it again, and anything else restarts the load.
const restored = chrome.storage.local.get(STORE.MODEL_STATUS).then(({ [STORE.MODEL_STATUS]: saved }) => {
  modelState ??= saved?.state ?? null;
  if (saved?.state === MODEL_STATE.ERROR) lastError = { at: saved.at, message: saved.message };
});

export function recordModelStatus({ state, ...detail }) {
  modelState = state;
  if (state === MODEL_STATE.ERROR) lastError = { at: Date.now(), message: detail.message };
  return chrome.storage.local.set({ [STORE.MODEL_STATUS]: { state, ...detail, at: Date.now() } });
}

// Firefox only. Imported on first use: a Chrome service worker cannot import() at all.
let runner = null;
async function inPageRunner() {
  runner ??= (await import('../model-runner.js')).createRunner((state, detail = {}) => recordModelStatus({ state, ...detail }));
  return runner;
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  creating ??= chrome.offscreen
    .createDocument({ url: OFFSCREEN_URL, reasons: ['WORKERS'], justification: 'Runs the on-device classifier' })
    .finally(() => (creating = null));
  await creating;
}

// Starts loading the model if it has not started. Does not wait: the model reports when it is
// ready, and the page re-decides its posts then.
export async function startModel({ force = false } = {}) {
  await restored;
  if (!force && modelState === MODEL_STATE.ERROR && Date.now() - lastError.at < RETRY_AFTER_ERROR_MS) return;
  if (!hasOffscreen) {
    (await inPageRunner()).start().catch(() => {}); // the runner has already reported the error
    return;
  }
  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', type: MSG.MODEL_START }).catch(() => {});
}

// Throws a `not-ready` error, and starts the model, unless it has reported ready.
export async function requireReady() {
  await restored;
  if (modelState === MODEL_STATE.READY) return;
  startModel().catch(console.warn);
  throw Object.assign(new Error('The model is not ready yet'), { code: NOT_READY });
}

export async function modelScore(text) {
  if (!hasOffscreen) return (await inPageRunner()).score(text);
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: MSG.SCORE, text });
  if (!response?.ok) throw new Error(response?.error ?? 'The model did not answer');
  return response.result;
}
