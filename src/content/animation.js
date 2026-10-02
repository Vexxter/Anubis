// Animated mode: a scan line runs over a post while the model judges it, then the post turns
// green and stays, or turns red and folds into its collapsed row.
(() => {
  const content = globalThis.ANUBIS_CONTENT;
  const { CLASS, DATA, ANIMATION, ABORT_ERROR, SCAN_DOWN_FRAMES, SCAN_UP_FRAMES } = content.config;
  const { settings, animated, animating, bars } = content.state;
  const { sleep } = content;
  const { resultFor } = content.results;
  const { render, renderError } = content.chip;

  function addOverlay(el, ...classNames) {
    const overlay = document.createElement('div');
    overlay.className = classNames.join(' ');
    el.append(overlay);
    return overlay;
  }

  // A scan line runs down the post, bounces off the bottom, runs back up, and keeps
  // going until the model has answered. The first trip down always finishes. After that it
  // stops wherever it is the moment the answer lands. Returns the line, left in place.
  async function playScan(el, pending) {
    let hasAnswer = false;
    const answered = pending.then(
      () => (hasAnswer = true),
      () => (hasAnswer = true),
    );

    const line = addOverlay(el, CLASS.SCANLINE);
    try {
      for (let pass = 0; el.isConnected; pass++) {
        const isUp = pass % 2 === 1;
        // Going up, the bright edge leads from the top of the line and the glow trails below.
        line.classList.toggle(CLASS.SCAN_UP, isUp);
        const trip = line.animate(isUp ? SCAN_UP_FRAMES : SCAN_DOWN_FRAMES, {
          duration: ANIMATION.SCAN_PASS_MS,
          easing: ANIMATION.SCAN_EASING,
          fill: 'forwards',
        });
        await (pass === 0 ? trip.finished : Promise.race([trip.finished, answered]));
        if (hasAnswer) {
          if (trip.playState === 'running') trip.pause();
          break;
        }
      }
    } catch (error) {
      line.remove();
      throw error;
    }
    return line;
  }

  // The verdict color fades in over the whole post while the scan line fades out.
  async function playVerdict(el, verdictClass, line) {
    const fill = addOverlay(el, CLASS.FILL, verdictClass);
    line.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ANIMATION.SCAN_FADE_MS, fill: 'forwards' });
    await fill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ANIMATION.VERDICT_FADE_MS, fill: 'forwards' }).finished;
    line.remove();
    return fill;
  }

  // The container closes in on itself: it shrinks to bar height while its content
  // slides up at half that speed, so the top and bottom edges meet in the middle.
  // Returns the running animations, the shrink last. They hold their final frame.
  function startCollapse(el, fill) {
    const startHeight = el.getBoundingClientRect().height;
    const endHeight = ANIMATION.COLLAPSED_HEIGHT_PX;
    const slideUp = `translateY(${-(startHeight - endHeight) / 2}px)`;
    const offset = ANIMATION.SHRINK_END_OFFSET;
    const timing = { duration: ANIMATION.COLLAPSE_MS, easing: ANIMATION.COLLAPSE_EASING, fill: 'forwards' };

    const slides = [...el.children]
      .filter((child) => child !== fill)
      .map((child) =>
        child.animate([{ transform: 'translateY(0)' }, { transform: slideUp, offset }, { transform: slideUp }], timing),
      );
    const shrink = el.animate(
      [
        { height: `${startHeight}px`, opacity: 1 },
        { height: `${endHeight}px`, opacity: 1, offset },
        { height: `${endHeight}px`, opacity: 0 },
      ],
      timing,
    );
    return [...slides, shrink];
  }

  const fadeInBar = (el) => bars.get(el)?.animate([{ opacity: 0 }, { opacity: 1 }], ANIMATION.BAR_FADE_MS);

  // Scan while the model decides. Pass: green fades in, holds, fades out, and the post stays.
  // Fail: red fades in, then the post collapses.
  async function playInspection(el, post, delayMs) {
    animating.add(el);
    const isCurrent = () => el.isConnected && el.dataset[DATA.ID] === post.id;
    const held = [];
    let line;
    let fill;
    try {
      await sleep(delayMs);
      el.dataset[DATA.ANIMATING] = 'true';
      const pending = resultFor(post);
      line = await playScan(el, pending);
      let result;
      try {
        result = await pending;
      } catch (error) {
        // Let the post be inspected again when it next comes on screen.
        animated.delete(post.id);
        if (isCurrent()) renderError(el, error);
        return;
      }
      if (!isCurrent()) return;
      // Nothing to judge, or an account already blocked: no verdict to play.
      if (result.unscorable || result.blocked) {
        render(el, post, result);
        return;
      }

      const isFlagged = result.p >= settings.threshold;
      fill = await playVerdict(el, isFlagged ? CLASS.FAIL : CLASS.PASS, line);

      if (isFlagged) {
        await sleep(ANIMATION.FAIL_HOLD_MS);
        held.push(...startCollapse(el, fill));
        await held.at(-1).finished;
        // Collapse for real before the held last frame is released, so nothing flickers.
        if (isCurrent()) {
          render(el, post, result);
          fadeInBar(el);
        }
      } else {
        if (isCurrent()) render(el, post, result);
        await sleep(ANIMATION.PASS_HOLD_MS);
        await fill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ANIMATION.PASS_FADE_MS, fill: 'forwards' }).finished;
      }
    } catch (error) {
      // AbortError: the site dropped the node mid-animation.
      if (error.name !== ABORT_ERROR) console.warn('[anubis]', error.message);
    } finally {
      line?.remove();
      fill?.remove();
      delete el.dataset[DATA.ANIMATING];
      animating.delete(el);
      for (const animation of held) animation.cancel();
    }
  }

  content.animation = Object.freeze({ playInspection });
})();
