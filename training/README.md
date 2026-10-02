# Training the on-device probe

The extension runs the frozen Laya multilingual encoder (INT8 ONNX) and a linear classifier on its
mean-pooled output. These scripts build both. Run them from this folder in a venv with
`pip install "laya[onnx]" datasets tqdm onnxruntime` and a CUDA build of torch for speed.

| Step | Script | Produces |
|---|---|---|
| 1. Embed the datasets (fp32, GPU) | `probe_embed.py` | `emb_cache.npz`, cross-domain AUC table |
| 2. Export the encoder, quantize to INT8, first probe | `export_probe.py` | `export/encoder.int8.onnx`, tokenizer, `probe.json` |
| 3. Re-embed with the INT8 model and refit | `refit_int8.py` | `export/probe.json` (the one that ships) |
| 4. Test in real Chrome | `e2e.mjs` | needs `npm i puppeteer-core`; opens a Chrome window |
| 4b. Test in real Firefox | `e2e-firefox.mjs` | same; checks through a mock x.com page, since WebDriver cannot open extension pages |

After step 3: copy `export/probe.json` to `assets/probe.json`, copy `export/encoder.int8.onnx`,
`tokenizer.json` and `tokenizer_config.json` to `model/`, and bump `MODEL_VERSION` in
`src/constants.js` (it keys the score cache).

Data: `KirillNik/tweepfake_synthetic` (AI tweets by Dolphin vs human source tweets) and
`arjun10g/slop-paraphrase-pairs-v2` (Reddit posts vs Llama-3.1-8B rewrites). Neither lists a license, so
they are used for local fitting only and are not redistributed. `data.py` is a small hand-written
multilingual sanity set, not a benchmark.

Measured cross-domain AUC (train on one dataset, test on the other): 0.84 and 0.82 after INT8.
Neither dataset contains posts from current frontier models, and none is real X traffic. The next
improvement is refitting on your own labels from the extension's Label buttons.
