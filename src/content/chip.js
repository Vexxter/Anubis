// Draws the verdict on a post: the chip, the collapsed row, the label and block controls.
(() => {
  const { MSG, MODE, LABEL, BLOCK_AFTER_FLAGS } = globalThis.ANUBIS;
  const content = globalThis.ANUBIS_CONTENT;
  const { CLASS, DATA, HIDE, TEXT, COLLAPSING_MODES, NOT_READY } = content.config;
  const { settings, revealed, labeled, offered, bars } = content.state;
  const { send } = content;
  const { blockAccount } = content.results;

  const OWN_BAR = `:scope > .${CLASS.BAR}`;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function button(label, onClick, isActive = false) {
    const el = element('button', CLASS.BUTTON, label);
    el.type = 'button';
    el.classList.toggle(CLASS.ACTIVE, isActive);
    el.addEventListener('click', onClick);
    return el;
  }

  // Sites open the post on any click inside it, and a chip can sit inside a link, where a
  // click would navigate.
  const stopClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  function buildBar(el, post, result, isFlagged, isHidden) {
    const bar = element('div', CLASS.BAR);
    bar.classList.toggle(CLASS.FLAGGED, isFlagged);
    bar.addEventListener('click', stopClick);

    const percent = Math.round(result.p * 100);
    const summary = element('span', '', isFlagged ? `${TEXT.EXILED} · ${percent}%` : `AI ${percent}%`);
    summary.title = `Anubis score ${result.features.score.toFixed(2)}. Exiles at ${Math.round(settings.threshold * 100)}% and above.`;
    bar.append(summary);

    if (isFlagged && settings.mode !== MODE.BADGE) {
      bar.append(
        button(isHidden ? TEXT.SHOW : TEXT.HIDE, () => {
          if (isHidden) revealed.add(post.id);
          else revealed.delete(post.id);
          render(el, post, result);
        }),
      );
    }

    if (settings.labeling) {
      const current = labeled.get(post.id);
      const onLabel = (label) => () => {
        labeled.set(post.id, label);
        send({ type: MSG.LABEL, post, features: result.features, label }).catch(console.warn);
        render(el, post, result);
      };
      const extras = [
        element('span', '', TEXT.LABEL_PROMPT),
        button(TEXT.LABEL_AI, onLabel(LABEL.AI), current === LABEL.AI),
        button(TEXT.LABEL_HUMAN, onLabel(LABEL.HUMAN), current === LABEL.HUMAN),
      ];
      if (post.handle) extras.push(button(TEXT.BLOCK, () => blockAccount(post)));
      for (const extra of extras) extra.classList.add(CLASS.EXTRA);
      bar.append(...extras);
    }
    return bar;
  }

  // Puts the chip in the item. The row of a collapsed item stands in for its hidden text.
  function mount(el, bar) {
    bars.set(el, bar);
    el.append(bar);
  }

  function clear(el) {
    // The tracked bar, and any left by an earlier copy of this script after an extension reload.
    bars.get(el)?.remove();
    bars.delete(el);
    for (const bar of el.querySelectorAll(OWN_BAR)) bar.remove();
    delete el.dataset[DATA.HIDE];
    el.dataset[DATA.BAR] = 'false';
    el.querySelector(`:scope > .${CLASS.OFFER}`)?.remove();
  }

  // Scoring failed, or the model is still loading. The post is left as it is. Nothing is
  // remembered here, so it is scored again the next time the site rebuilds it, and the
  // whole page is re-decided the moment the model reports ready.
  function renderError(el, error) {
    if (error.code !== NOT_READY) console.warn('[anubis]', error.message, error.detail ?? '');
    clear(el);
  }

  // The row for a post from a blocked account: no score, no model call.
  function renderBlocked(el, post) {
    clear(el);
    el.dataset[DATA.HIDE] = HIDE.COLLAPSE;
    const bar = element('div', `${CLASS.BAR} ${CLASS.FLAGGED}`);
    bar.addEventListener('click', stopClick);
    bar.append(element('span', '', `${TEXT.BLOCKED} ${post.handle}`));
    el.append(bar);
    bars.set(el, bar);
    el.dataset[DATA.BAR] = 'true';
  }

  // Once an account's flagged posts reach the threshold, the next one carries an offer.
  const wantsOffer = (post, result) =>
    Boolean(post.handle) &&
    (result.flagCount ?? 0) >= BLOCK_AFTER_FLAGS &&
    result.flagCount % BLOCK_AFTER_FLAGS === 0 &&
    !offered.has(post.handle);

  function buildOffer(post, result) {
    const offer = element('div', CLASS.OFFER);
    offer.addEventListener('click', stopClick);
    offer.append(
      element('span', '', TEXT.BLOCK_OFFER(result.flagCount, post.handle)),
      button(TEXT.BLOCK_YES, () => blockAccount(post)),
      button(TEXT.BLOCK_NO, () => {
        offered.add(post.handle);
        offer.remove();
      }),
    );
    return offer;
  }

  function render(el, post, result) {
    if (result.blocked) return renderBlocked(el, post);
    clear(el);
    if (result.unscorable) return undefined;
    const isFlagged = result.p >= settings.threshold;
    const isHidden = isFlagged && !revealed.has(post.id);
    if (isHidden && COLLAPSING_MODES.has(settings.mode)) el.dataset[DATA.HIDE] = HIDE.COLLAPSE;
    else if (isHidden && settings.mode === MODE.DIM) el.dataset[DATA.HIDE] = HIDE.DIM;

    const wantsBar = isFlagged || settings.labeling;
    el.dataset[DATA.BAR] = String(wantsBar);
    if (!wantsBar) return undefined;
    mount(el, buildBar(el, post, result, isFlagged, isHidden));
    if (isFlagged && wantsOffer(post, result)) el.append(buildOffer(post, result));
    return undefined;
  }

  content.chip = Object.freeze({ render, renderError, clear });
})();
