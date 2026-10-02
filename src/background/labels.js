// AI / Human labels the user gives with the chip buttons. They stay on this machine until the
// user exports them from the options page.
import '../constants.js';

const { STORE } = globalThis.ANUBIS;

// Writes are read-modify-write on one key, so they run one at a time.
let writes = Promise.resolve();

export function saveLabel({ post, features, label }) {
  writes = writes.then(async () => {
    const { [STORE.LABELS]: labels = {} } = await chrome.storage.local.get(STORE.LABELS);
    labels[post.id] = { ...post, features, label, labeled_at: Date.now() };
    await chrome.storage.local.set({ [STORE.LABELS]: labels });
  });
  return writes;
}
