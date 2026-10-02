// Scores a post: from the persistent cache when it can, from the model when it must.
import '../constants.js';
import { cacheKey, getCached, putCached, putFailure } from '../cache.js';
import { sigmoid } from '../probe.js';
import { countFlag } from './accounts.js';
import { modelScore, requireReady } from './model-host.js';

const { MODEL_VERSION } = globalThis.ANUBIS;

// Cache key -> promise of the stored result. Holding the promise dedupes concurrent asks.
const inFlight = new Map();

async function scoreAndStore(key, text) {
  try {
    const { score, tokens, latencyMs } = await modelScore(text);
    const stored = { s: score, n: tokens };
    await putCached(key, stored);
    return { stored, latencyMs };
  } catch (error) {
    putFailure(key);
    throw error;
  }
}

function scoreOnce(key, text) {
  if (!inFlight.has(key)) {
    const pending = scoreAndStore(key, text);
    const forget = () => inFlight.delete(key);
    pending.then(forget, forget);
    inFlight.set(key, pending);
  }
  return inFlight.get(key);
}

// `usage` is null when the answer came from the cache, so nothing is counted twice.
async function classify(post) {
  const key = cacheKey(MODEL_VERSION, post.text);
  const cached = await getCached(key);
  if (cached.failed) throw new Error('Scoring this post failed a moment ago');

  let stored = cached.value;
  let latencyMs = null;
  if (!stored) {
    await requireReady();
    ({ stored, latencyMs } = await scoreOnce(key, post.text));
  }
  return {
    features: { score: stored.s },
    p: sigmoid(stored.s),
    usage: latencyMs === null ? null : { inputTokens: stored.n, latencyMs },
  };
}

// Scores a post and counts a flag against its account. The page checks the block list
// first, before it sends any text.
export async function classifyAndCount({ post, threshold }) {
  const result = await classify(post);
  const isFresh = result.usage !== null;
  if (isFresh && post.handle && result.p >= threshold) result.flagCount = await countFlag(post);
  return result;
}
