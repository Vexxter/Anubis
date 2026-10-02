// The classifier head: one dot product over the encoder's mean-pooled embedding.
// Pure module, shared by the offscreen document and the Node tests.
// assets/probe.json holds standardization already folded into the weights, so
// score = embedding . w + b and probability = sigmoid(score).

export function loadProbe(json) {
  if (json.w.length !== json.dim) throw new Error(`probe has ${json.w.length} weights, expected ${json.dim}`);
  return { w: Float32Array.from(json.w), b: json.b, dim: json.dim, maxLen: json.max_len };
}

export function score(probe, embedding) {
  if (embedding.length !== probe.dim) throw new Error(`embedding has ${embedding.length} values, expected ${probe.dim}`);
  let z = probe.b;
  for (let i = 0; i < embedding.length; i++) z += embedding[i] * probe.w[i];
  return z;
}

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
