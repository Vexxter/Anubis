// Blocked accounts, keyed `site:handle`, and how many of each account's posts were flagged.
// Read once, kept here, written on change. Every tab asks this worker, so they agree.
import '../constants.js';

const { STORE } = globalThis.ANUBIS;

const accountKey = (site, handle) => `${site}:${handle}`;
let accounts = null;

async function load() {
  if (!accounts) {
    const stored = await chrome.storage.local.get([STORE.BLOCKED, STORE.FLAG_COUNTS]);
    accounts = { blocked: stored[STORE.BLOCKED] ?? {}, flagCounts: stored[STORE.FLAG_COUNTS] ?? {} };
  }
  return accounts;
}

const save = () => chrome.storage.local.set({ [STORE.BLOCKED]: accounts.blocked, [STORE.FLAG_COUNTS]: accounts.flagCounts });

export async function blockedList() {
  return (await load()).blocked;
}

export async function isBlocked({ site, handle }) {
  return Boolean((await blockedList())[accountKey(site, handle)]);
}

export async function block({ site, handle }) {
  await load();
  accounts.blocked[accountKey(site, handle)] = { site, handle, blocked_at: Date.now() };
  delete accounts.flagCounts[accountKey(site, handle)];
  await save();
}

export async function unblock({ key }) {
  await load();
  delete accounts.blocked[key];
  await save();
}

// Counts a flagged post against its account. Returns the count, so the page can offer a
// block once it reaches the threshold.
export async function countFlag({ site, handle }) {
  await load();
  const key = accountKey(site, handle);
  accounts.flagCounts[key] = (accounts.flagCounts[key] ?? 0) + 1;
  await save();
  return accounts.flagCounts[key];
}
