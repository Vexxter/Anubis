// Text -> mean-pooled encoder embedding. No chrome APIs: the offscreen document hands in
// the onnxruntime-web and tokenizers modules and the model bytes, and the Node tests do the same.

// Python's truncation=True keeps the closing special token, so a cut text still ends in it.
export function truncateIds(ids, maxLen) {
  if (ids.length <= maxLen) return ids;
  return [...ids.slice(0, maxLen - 1), ids[ids.length - 1]];
}

export async function createEmbedder({ ort, Tokenizer, modelBytes, tokenizerJson, tokenizerConfig, maxLen, numThreads = 1 }) {
  ort.env.wasm.numThreads = numThreads;
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });

  // ponytail: one post per run, strictly one at a time. Batching would amortize the
  // WASM call overhead, but at ~100 ms a post the queue is not the bottleneck yet.
  return async function embed(text) {
    const ids = truncateIds(tokenizer.encode(text).ids, maxLen);
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      attention_mask: new ort.Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
    };
    const { pooled } = await session.run(feeds);
    return { embedding: pooled.data, tokens: ids.length };
  };
}
