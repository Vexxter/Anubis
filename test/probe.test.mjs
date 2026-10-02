import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadProbe, score, sigmoid } from '../src/probe.js';
import { truncateIds } from '../src/embedder.js';

test('score is the dot product plus bias', () => {
  const probe = loadProbe({ w: [1, -2, 0.5], b: 0.25, dim: 3, max_len: 128 });
  assert.equal(score(probe, [2, 1, 4]), 2 - 2 + 2 + 0.25);
});

test('score rejects an embedding of the wrong size', () => {
  const probe = loadProbe({ w: [1, 2], b: 0, dim: 2, max_len: 128 });
  assert.throws(() => score(probe, [1, 2, 3]), /expected 2/);
});

test('loadProbe rejects a weight vector that does not match dim', () => {
  assert.throws(() => loadProbe({ w: [1], b: 0, dim: 2, max_len: 128 }), /expected 2/);
});

test('sigmoid maps 0 to 0.5 and saturates', () => {
  assert.equal(sigmoid(0), 0.5);
  assert.ok(sigmoid(20) > 0.999 && sigmoid(-20) < 0.001);
});

test('truncateIds keeps the closing token when it cuts', () => {
  assert.deepEqual(truncateIds([2, 5, 6, 7, 8, 1], 4), [2, 5, 6, 1]);
  assert.deepEqual(truncateIds([2, 5, 1], 4), [2, 5, 1]);
});

test('the shipped probe matches its declared dimension', async () => {
  const { readFile } = await import('node:fs/promises');
  const probe = loadProbe(JSON.parse(await readFile(new URL('../assets/probe.json', import.meta.url), 'utf8')));
  assert.equal(probe.dim, 768);
});
