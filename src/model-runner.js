// Loads the bundled model and scores text with it. Chrome runs this in an offscreen document;
// Firefox has none, so its background page runs it directly. `report(state, detail)` says
// where the model is: loading, ready, or error.
import * as ort from '../vendor/ort.wasm.min.mjs';
import { Tokenizer } from '../vendor/tokenizers.min.mjs';
import { createEmbedder } from './embedder.js';
import { loadProbe, score } from './probe.js';

const { MODEL_STATE } = globalThis.ANUBIS;
const fromExtension = (path) => fetch(chrome.runtime.getURL(path));

async function load(report) {
  report(MODEL_STATE.LOADING);
  const probe = loadProbe(await (await fromExtension('assets/probe.json')).json());
  ort.env.wasm.wasmPaths = chrome.runtime.getURL('vendor/');
  const embed = await createEmbedder({
    ort,
    Tokenizer,
    modelBytes: await (await fromExtension('model/encoder.int8.onnx')).arrayBuffer(),
    tokenizerJson: await (await fromExtension('model/tokenizer.json')).json(),
    tokenizerConfig: await (await fromExtension('model/tokenizer_config.json')).json(),
    maxLen: probe.maxLen,
  });
  report(MODEL_STATE.READY);
  return async (text) => {
    const startedAt = performance.now();
    const { embedding, tokens } = await embed(text);
    return { score: score(probe, embedding), tokens, latencyMs: performance.now() - startedAt };
  };
}

export function createRunner(report) {
  let loaded = null;
  // One post at a time: onnxruntime-web runs a session serially anyway.
  let queue = Promise.resolve();

  // Loads on the first call and shares that load. A failure is reported and forgotten, so the
  // next call tries again.
  const start = () =>
    (loaded ??= load(report).catch((error) => {
      loaded = null;
      report(MODEL_STATE.ERROR, { message: error.message });
      throw error;
    }));

  function scoreText(text) {
    const run = queue.then(async () => (await start())(text));
    queue = run.catch(() => {});
    return run;
  }

  return { start, score: scoreText };
}
