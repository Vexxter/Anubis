// Persistent score cache in IndexedDB, so a post scored once is not scored again after the
// service worker restarts. Keyed by a hash of (model version, text): a new model invalidates
// it. A post that failed is remembered briefly, in memory only, so X rebuilding its node
// does not retry it in a loop.
import { hashText } from './hash.js';

const DB_NAME = 'anubis-cache';
const STORE_NAME = 'scores';
const MAX_ENTRIES = 20_000;
const PRUNE_SLACK = 1_000;
const FAILURE_TTL_MS = 5 * 60 * 1000;

export const cacheKey = (modelVersion, text) => hashText(`${modelVersion}\n${text}`);

let opening = null;
function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'k' }).createIndex('t', 't');
    request.onsuccess = () => {
      resolve(request.result);
      prune(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return opening;
}

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

// ponytail: first-in-first-out, not least-recently-used, so a read costs no write.
// Ceiling: a post seen every day can still age out; upgrade path is touching `t` on a hit.
function prune(db) {
  const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  store.count().onsuccess = (event) => {
    let excess = event.target.result - MAX_ENTRIES;
    if (excess < PRUNE_SLACK) return;
    store.index('t').openCursor().onsuccess = (cursorEvent) => {
      const cursor = cursorEvent.target.result;
      if (!cursor || excess-- <= 0) return;
      cursor.delete();
      cursor.continue();
    };
  };
}

const failures = new Map(); // key -> failedAt

export async function getCached(key, now = Date.now()) {
  if (now - (failures.get(key) ?? -Infinity) < FAILURE_TTL_MS) return { failed: true };
  const row = await requestResult((await open()).transaction(STORE_NAME).objectStore(STORE_NAME).get(key));
  return row ? { value: row.v } : {};
}

export async function putCached(key, value, now = Date.now()) {
  failures.delete(key);
  await requestResult((await open()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ k: key, v: value, t: now }));
}

export function putFailure(key, now = Date.now()) {
  failures.set(key, now);
}

export async function clearCache() {
  failures.clear();
  await requestResult((await open()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear());
}
