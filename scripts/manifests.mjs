// The browser-specific manifest, derived from manifest.json so the browsers cannot
// drift apart. Only the Firefox differences live here: the background entry, the add-on
// identity, and two Chrome-only keys (the offscreen permission and the minimum Chrome
// version) that Firefox does not know. Firefox has no offscreen documents, so its
// background page runs the model. Everything else is inherited from the shared manifest.
import { readFileSync } from 'node:fs';

export const BROWSERS = ['chrome', 'firefox'];
// On Firefox the add-on ID is the extension's permanent identity: changing it makes Firefox
// treat the next release as a different add-on.
export const FIREFOX_ID = 'anubis@vexxter.github.io';
// 140 is the first release that reads data_collection_permissions, which AMO now requires.
// Background scripts as a module need 112, and Zen and current Firefox are well past both.
export const FIREFOX_MIN_VERSION = '140.0';

const CHROME_ONLY_PERMISSIONS = new Set(['offscreen']);

export const readManifest = (path = 'manifest.json') => JSON.parse(readFileSync(path, 'utf8'));

export function resolveManifest(target, source) {
  if (!BROWSERS.includes(target)) throw new Error(`Unknown browser: ${target}`);
  const manifest = structuredClone(source);
  if (target === 'chrome') return manifest;

  const { service_worker: serviceWorker, ...background } = manifest.background ?? {};
  if (!serviceWorker) {
    throw new Error('manifest.json has no background.service_worker to derive the Firefox package from');
  }
  manifest.background = { scripts: [serviceWorker], ...background };
  manifest.permissions = manifest.permissions?.filter((permission) => !CHROME_ONLY_PERMISSIONS.has(permission));
  delete manifest.minimum_chrome_version;
  manifest.browser_specific_settings = {
    // The extension collects and transmits nothing: scoring happens on the device.
    gecko: { id: FIREFOX_ID, strict_min_version: FIREFOX_MIN_VERSION, data_collection_permissions: { required: ['none'] } },
  };
  return manifest;
}
