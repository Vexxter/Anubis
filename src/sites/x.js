// Site adapter for x.com. The core in content.js is site-neutral and only talks to
// `globalThis.ANUBIS_SITE`:
//   name          short site id, saved on every label
//   itemSelector  matches every element that might be a scorable post
//   extract(el)   -> { id, handle, text } or null. Reads the tweet's text.
//   idOf(el)      -> the post id, or null. Called for every item on every page change, so it
//                 reads one attribute and nothing else.
//   chipHosts(el) -> optional. Elements in the site's own header line that the score chip
//                 may be mounted in, best spot first. The chip goes at the end of the first
//                 one where it shows up and the host stays the same height, as an inline
//                 pill. A host belongs to one item only. Without the hook, with an empty
//                 list, or when no host fits, the chip floats over a corner of the item.
//                 A collapsed item's row and an error always go in the item.
(() => {
  const { readText } = globalThis.ANUBIS_DOM;

  const SEL = Object.freeze({
    TWEET: 'article[data-testid="tweet"]',
    TEXT: '[data-testid="tweetText"]',
    PERMALINK_TIME: 'a[href*="/status/"] time',
    QUOTE_CONTAINER: 'div[role="link"]',
  });
  const STATUS_PATH = /^\/([^/]+)\/status\/(\d+)/;

  function statusOf(article) {
    const link = article.querySelector(SEL.PERMALINK_TIME)?.closest('a');
    return link?.getAttribute('href')?.match(STATUS_PATH) ?? null;
  }

  const idOf = (article) => statusOf(article)?.[2] ?? null;

  function extract(article) {
    const match = statusOf(article);
    const textNode = article.querySelector(SEL.TEXT);
    // A tweet with no text of its own would otherwise pick up the quoted tweet's text.
    if (!match || !textNode || textNode.closest(SEL.QUOTE_CONTAINER)) return null;
    return { id: match[2], handle: match[1], text: readText(textNode).trim() };
  }

  globalThis.ANUBIS_SITE = Object.freeze({ name: 'x', itemSelector: SEL.TWEET, extract, idOf });
})();
