// Gets a post's result: from this page's memory, or from the worker. Also the block action,
// which rewrites remembered results.
(() => {
  const { MSG } = globalThis.ANUBIS;
  const content = globalThis.ANUBIS_CONTENT;
  const { results, settings } = content.state;
  const { MIN_WORDS } = content.config;
  const { send } = content;
  const STATS = globalThis.ANUBIS_STATS;

  const isTooShort = (text) => !text || text.split(/\s+/).length < MIN_WORDS;

  // A post that cannot be judged: too little text. Remembered like any result, so it is not
  // looked at again.
  const UNSCORABLE = Object.freeze({ unscorable: true });
  const blockedResult = (handle) => ({ blocked: true, handle });

  async function resultFor(post) {
    if (!results.has(post.id)) {
      // A blocked account's post is settled before any text is sent.
      if (post.handle && (await send({ type: MSG.IS_BLOCKED, post }))) {
        results.set(post.id, blockedResult(post.handle));
        return results.get(post.id);
      }
      if (isTooShort(post.text)) {
        results.set(post.id, UNSCORABLE);
        return UNSCORABLE;
      }
      const result = await send({ type: MSG.CLASSIFY, post, threshold: settings.threshold });
      result.handle = post.handle;
      results.set(post.id, result);
      // Once per post per page, the moment the answer lands.
      STATS.record({ usage: result.usage, isFlagged: result.p >= settings.threshold });
    }
    return results.get(post.id);
  }

  // Hides every post from an account from now on, on every page.
  async function blockAccount(post) {
    await send({ type: MSG.BLOCK, post });
    for (const [id, result] of results) {
      if (result.handle === post.handle) results.set(id, blockedResult(post.handle));
    }
    content.scheduler.rerenderAll();
  }

  content.results = Object.freeze({ resultFor, blockAccount, isTooShort });
})();
