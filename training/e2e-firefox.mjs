// Same check as e2e.mjs, on Firefox/Zen. Builds the derived Firefox package into a temp folder,
// installs it as a temporary add-on in a temp profile, and runs the model in the background page.
// WebDriver cannot open moz-extension:// pages, so this checks through a mock x.com page only.
//   node e2e-firefox.mjs "C:/Program Files/Mozilla Firefox/firefox.exe"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { FIREFOX_ID, readManifest, resolveManifest } from '../scripts/manifests.mjs';

const FIREFOX = process.argv[2] ?? 'C:/Program Files/Mozilla Firefox/firefox.exe';
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(os.tmpdir(), `anubis-ff-${Date.now()}`);
const UUID = '5e1f0c4a-7a43-4c46-9a53-0b2f6e0a1c11';
const log = console.log;

fs.cpSync(SRC, DIR, { recursive: true, filter: (s) => !/[\/](test|scripts|docs|\.github|node_modules)([\/]|$)/.test(s) });
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(resolveManifest('firefox', readManifest(path.join(SRC, 'manifest.json'))), null, 2));

const browser = await puppeteer.launch({
  browser: 'firefox', executablePath: FIREFOX, headless: false,
  extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ [FIREFOX_ID]: UUID }) },
});
try {
  log('installed as', await browser.installExtension(DIR));
  const tweet = (i, handle, text) => `<div data-testid="cellInnerDiv"><article data-testid="tweet" style="padding:12px;border-bottom:1px solid #ccc"><a href="/${handle}/status/${i}"><time>1h</time></a><div data-testid="tweetText">${text}</div></article></div>`;
  const html = `<!doctype html><meta charset=utf-8><body style="width:600px;font:15px sans-serif">${[
    tweet(2001, 'bot_a', "It's not just a tool, it's a paradigm shift. Here's the thing: the real unlock is consistency. Curious what you think?"),
    tweet(2002, 'person_b', 'lol my build broke twice on friday and idk why. anyway coffee fixed it'),
  ].join('')}</body>`;
  const x = await browser.newPage();
  await x.setRequestInterception(true);
  x.on('request', (req) => (req.url().startsWith('https://x.com/') ? req.respond({ status: 200, contentType: 'text/html', body: html }) : req.continue()));
  x.on('console', (m) => m.text().includes('[anubis]') && log('[x.com]', m.text()));
  const t0 = Date.now();
  await x.goto('https://x.com/home');
  // The model loads on first use. Until it reports ready the posts are left alone, then re-decided.
  while (Date.now() - t0 < 90000 && (await x.evaluate(() => document.querySelectorAll('.anubis-bar').length)) < 2) {
    await new Promise((r) => setTimeout(r, 500));
  }
  log(`bars appeared after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const s of await x.evaluate(() => [...document.querySelectorAll('article')].map((a) => ({ id: a.dataset.anubisId, hide: a.dataset.anubisHide ?? null, bar: a.querySelector('.anubis-bar')?.innerText.replace(/\s+/g, ' ') ?? null })))) {
    log('tweet', s.id, '| hide:', s.hide, '| bar:', s.bar);
  }
} catch (e) {
  log('FAILED', e.message);
} finally {
  await browser.close();
  fs.rmSync(DIR, { recursive: true, force: true });
}
