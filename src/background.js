// Entry point of the extension's background worker. Routes messages from the pages and the
// options screen to the modules in src/background/. Posts never leave the machine.
import './constants.js';
import { block, blockedList, isBlocked, unblock } from './background/accounts.js';
import { saveLabel } from './background/labels.js';
import { recordModelStatus, startModel } from './background/model-host.js';
import { classifyAndCount } from './background/scoring.js';

const { MSG } = globalThis.ANUBIS;

// Messages only the extension's own pages may send, never a content script on a site.
const EXTENSION_ONLY = new Set([MSG.MODEL_START, MSG.MODEL_STATUS]);

const HANDLERS = {
  [MSG.CLASSIFY]: classifyAndCount,
  [MSG.MODEL_START]: () => startModel({ force: true }),
  [MSG.MODEL_STATUS]: recordModelStatus,
  [MSG.IS_BLOCKED]: ({ post }) => isBlocked(post),
  [MSG.LABEL]: saveLabel,
  [MSG.BLOCK]: ({ post }) => block(post),
  [MSG.UNBLOCK]: unblock,
  [MSG.BLOCKED_LIST]: blockedList,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  // `target` marks messages meant for the offscreen document, which has its own listener.
  if (!handler || message.target === 'offscreen') return false;
  if (EXTENSION_ONLY.has(message.type) && !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;

  Promise.resolve()
    .then(() => handler(message))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message, detail: error.detail, code: error.code }));
  return true;
});

// Load the model as soon as the extension is installed, so it is ready by the first scroll.
chrome.runtime.onInstalled.addListener(() => startModel().catch(console.warn));
