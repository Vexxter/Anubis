// Hidden page that runs the model on Chrome. A service worker cannot hold a 300 MB WASM session
// across its restarts, and cannot spawn the workers onnxruntime-web wants. Only chrome.runtime
// exists here, so everything goes through messages: scores come back, files and storage stay with
// the worker. The model ships inside the extension (model/), so there is nothing to download.
import { createRunner } from './model-runner.js';

const { MSG, MODEL_STATE } = globalThis.ANUBIS;

const report = (state, detail = {}) => chrome.runtime.sendMessage({ type: MSG.MODEL_STATUS, state, ...detail }).catch(() => {});
const runner = createRunner(report);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;
  if (message.type === MSG.MODEL_START) {
    // Re-announce: a worker that restarted has forgotten that the model is ready.
    runner.start().then(
      () => {
        report(MODEL_STATE.READY);
        sendResponse({ ok: true });
      },
      (error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }
  if (message.type === MSG.SCORE) {
    runner.score(message.text).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }
  return false;
});
