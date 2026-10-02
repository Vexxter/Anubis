// End-to-end check in real Chrome: loads the unpacked extension in a temp profile, waits for the
// bundled model, scores four posts through the real message path, then runs the content script
// on a mock x.com timeline. Needs `npm i puppeteer-core` next to this file. Opens a Chrome window.
//   node e2e.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe"
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = console.log;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false, pipe: true, enableExtensions: [EXT],
  userDataDir: path.join(os.tmpdir(), `anubis-e2e-${Date.now()}`),
  args: ['--window-size=900,700', '--no-first-run', '--no-default-browser-check'],
});
try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 30000 });
  const id = new URL(sw.url()).host;
  const page = await browser.newPage();
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  await page.goto(`chrome-extension://${id}/options.html`);

  const t0 = Date.now();
  let state;
  do {
    await new Promise((r) => setTimeout(r, 300));
    state = await page.evaluate(async () => (await chrome.storage.local.get('modelStatus')).modelStatus);
  } while (state?.state !== 'ready' && state?.state !== 'error' && Date.now() - t0 < 120000);
  log(`model ${state?.state}${state?.message ? ': ' + state.message : ''} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const ask = (text, n) => page.evaluate((text, n) => chrome.runtime.sendMessage({ type: 'anubis/classify', threshold: 0.75, post: { id: n, site: 'x', handle: 'tester', text } }), text, n);
  for (const [name, text] of [
    ['ai-en', "It's not just a tool, it's a paradigm shift. Here's the thing: the real unlock is consistency. Curious what you think?"],
    ['human-en', 'lol my build broke twice on friday and idk why. anyway coffee fixed it'],
    ['ai-es', 'No es solo una herramienta, es un cambio de paradigma. La clave real es la constancia. ¿Qué opinas?'],
    ['human-es', 'jajaja mi gato tiró la planta otra vez y me miró como diciendo qué. lo amo pero lo voy a vender'],
  ]) {
    const r = await ask(text, name);
    log(name.padEnd(9), r.ok ? `p=${r.result.p.toFixed(3)} ${r.result.usage ? `${Math.round(r.result.usage.latencyMs)}ms` : 'cached'}` : `ERROR ${r.error}`);
  }

  const tweet = (i, handle, text) => `<div data-testid="cellInnerDiv"><article data-testid="tweet" style="padding:12px;border-bottom:1px solid #ccc"><a href="/${handle}/status/${i}"><time>1h</time></a><div data-testid="tweetText">${text}</div></article></div>`;
  const html = `<!doctype html><meta charset=utf-8><body style="width:600px;font:15px sans-serif">${[
    tweet(2001, 'bot_a', "It's not just a tool, it's a paradigm shift. Here's the thing: the real unlock is consistency. Curious what you think?"),
    tweet(2002, 'person_b', 'lol my build broke twice on friday and idk why. anyway coffee fixed it'),
    tweet(2004, 'short_d', 'nice'),
  ].join('')}</body>`;
  const x = await browser.newPage();
  await x.setRequestInterception(true);
  x.on('request', (req) => (req.url().startsWith('https://x.com/') ? req.respond({ status: 200, contentType: 'text/html', body: html }) : req.continue()));
  await x.goto('https://x.com/home');
  await new Promise((r) => setTimeout(r, 4000));
  for (const s of await x.evaluate(() => [...document.querySelectorAll('article')].map((a) => ({ id: a.dataset.anubisId, hide: a.dataset.anubisHide ?? null, bar: a.querySelector('.anubis-bar')?.innerText.replace(/\s+/g, ' ') ?? null })))) {
    log('tweet', s.id, '| hide:', s.hide, '| bar:', s.bar);
  }
  const requests = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => !e.name.startsWith('chrome-extension://')).map((e) => e.name));
  log('non-extension requests from the options page:', requests.length);
  if (requests.length) throw new Error(`the extension made network requests: ${requests.join(', ')}`);
} catch (e) {
  log('FAILED', e.message);
} finally {
  await browser.close();
}
