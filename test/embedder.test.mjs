// Parity against Python: same token ids, embeddings within int8 noise. Needs the 294MB model
// from model/, so it is skipped when that file is absent (CI, fresh clones without the model).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as ort from '../vendor/ort.wasm.min.mjs';
import { Tokenizer } from '../vendor/tokenizers.min.mjs';
import { createEmbedder, truncateIds } from '../src/embedder.js';

const MODEL_DIR = new URL('../model/', import.meta.url);
const hasModel = existsSync(new URL('encoder.int8.onnx', MODEL_DIR));
const cosine = (a, b) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / Math.sqrt(x * y);
};

test('JS tokenizer and wasm encoder match Python', { skip: !hasModel && 'model/encoder.int8.onnx not present' }, async () => {
  const read = (name) => readFile(new URL(name, MODEL_DIR));
  const tokenizerJson = JSON.parse(await read('tokenizer.json'));
  const tokenizerConfig = JSON.parse(await read('tokenizer_config.json'));
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/parity.json', import.meta.url), 'utf8'));

  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  for (const { text, ids } of fixtures) assert.deepEqual(truncateIds(tokenizer.encode(text).ids, 128), ids);

  const embed = await createEmbedder({ ort, Tokenizer, modelBytes: await read('encoder.int8.onnx'), tokenizerJson, tokenizerConfig, maxLen: 128 });
  for (const { text, emb } of fixtures) {
    const { embedding } = await embed(text);
    assert.equal(embedding.length, 768);
    assert.ok(cosine(embedding, emb) > 0.98, `cosine ${cosine(embedding, emb)}`);
  }
});
