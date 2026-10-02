# Anubis: development

## Layout

| Path | Role |
|---|---|
| `src/background.js` | Entry point of the worker. Routes messages to `src/background/`. |
| `src/background/model-host.js` | Starts the model and scores text with it. Hides whether it runs offscreen or in the page. |
| `src/background/scoring.js` | Cache lookup, de-duplicated model calls, flag counting. |
| `src/background/accounts.js`, `labels.js` | Block list and flag counts; user labels. |
| `src/offscreen.js`, `offscreen.html` | Chrome only. Hidden page that holds the loaded model and answers score messages. |
| `src/model-runner.js` | Loads the model and scores text. Used by the offscreen page, and by the background page on Firefox. |
| `src/embedder.js`, `src/probe.js` | Tokenize and run the encoder; the linear classifier. Pure, tested in Node. |
| `src/cache.js`, `src/hash.js` | IndexedDB score cache and its key hash. |
| `src/content/` | The page side. See below. |
| `src/sites/x.js`, `x.css` | The X adapter: finds posts, reads their text. |
| `src/options.js`, `options.html` | Settings, model status, block list, labels. |
| `src/constants.js` | Message names, storage keys, defaults, `MODEL_VERSION`. |
| `vendor/` | onnxruntime-web and @huggingface/tokenizers, copied from npm. |
| `model/` | `encoder.int8.onnx`, `tokenizer.json`, `tokenizer_config.json`. Shipped in the package, not in git. |
| `assets/probe.json` | Classifier weights. |
| `training/` | How the classifier and the ONNX model are built. |

## Content scripts without modules

Content scripts cannot `import`, and this project has no bundler on purpose. The files in
`src/content/` are classic scripts that share one registry, `globalThis.ANUBIS_CONTENT`, and load in the
order listed in `manifest.json`:

`config` → `state` → `results` → `chip` → `animation` → `scheduler`

Each file reads what it needs from the registry when it loads, so a file may only use modules listed
before it. The one backward reference, `results.blockAccount` calling `scheduler.rerenderAll`, is looked up
at call time. Site adapters expose `globalThis.ANUBIS_SITE` (`itemSelector`, `extract`, `idOf`).

## Model status

The model reports `loading`, `ready`, or `error`. The worker stores the latest as `modelStatus` in
`chrome.storage.local`. The options page shows it, and content scripts re-decide the page when it becomes
`ready`. Until then `classify` answers with code `not-ready` and the post is left visible.

## Changing the model or the classifier

Follow `../training/README.md`, then bump `MODEL_VERSION` in `src/constants.js`: the score cache is keyed by it.

## Commands

```
npm run lint        eslint
npm test            node --test (the parity test skips without model/encoder.int8.onnx)
npm run zip:chrome  dist/anubis-<version>-chrome.zip
npm run zip:firefox dist/anubis-<version>-firefox.zip
```

## Known limits

- One post is scored at a time, on single-threaded WASM (about 100 to 200 ms per post). Threads need cross-origin isolation for the offscreen page.
- The score cache evicts oldest-first, not least-recently-used.
- The package is about 340 MB. Chrome Web Store and addons.mozilla.org size limits for it have not been checked, and addons.mozilla.org documents a 200 MB limit.
- Firefox may unload an idle background page, which drops the loaded model; the next post reloads it (about 3 s). Not measured.
- Tested on Chrome 154 and Firefox 155. Zen shares Firefox's engine.
