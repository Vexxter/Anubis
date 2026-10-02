// Live stats panel, made for demos and recordings. Shows what the extension has done
// on this page since it loaded: posts scanned, posts exiled, and scoring time.
// The core reports each scored post through `globalThis.ANUBIS_STATS.record`.
(() => {
  const CLASS = Object.freeze({
    PANEL: 'anubis-stats',
    HEADER: 'anubis-stats-header',
    DOT: 'anubis-stats-dot',
    RESET: 'anubis-stats-reset',
    GRID: 'anubis-stats-grid',
    VALUE: 'anubis-stats-value',
    LABEL: 'anubis-stats-label',
    FOOT: 'anubis-stats-foot',
  });
  const TEXT = Object.freeze({
    TITLE: 'Anubis · live',
    RESET: 'reset',
    SCANNED: 'posts scanned',
    CAUGHT: 'exiled',
    LAST: 'last score',
    COST: 'cost',
  });
  const TICK = Object.freeze({ COLOR: 'rgb(168, 151, 255)', MS: 600 });
  const LOCALE = 'en-US';

  const fresh = () => ({
    scanned: 0,
    caught: 0,
    requests: 0,
    inputTokens: 0,
    lastMs: null,
    totalMs: 0,
  });

  let totals = fresh();
  let panel = null;
  const fields = {};

  const count = (n) => n.toLocaleString(LOCALE);
  const ms = (n) => `${count(Math.round(n))} ms`;

  function readout() {
    const { scanned, caught, requests, inputTokens, lastMs, totalMs } = totals;
    const share = scanned ? ` (${Math.round((caught / scanned) * 100)}%)` : '';
    const average = requests ? ms(totalMs / requests) : ms(0);
    return {
      scanned: count(scanned),
      caught: `${count(caught)}${share}`,
      last: lastMs === null ? ms(0) : ms(lastMs),
      cost: '$0',
      foot: [`avg ${average}`, `${count(inputTokens)} tokens`, 'on this computer'].join(' · '),
    };
  }

  function render() {
    if (!panel) return;
    for (const [name, text] of Object.entries(readout())) {
      const field = fields[name];
      if (field.textContent === text) continue;
      field.textContent = text;
      // A short color pulse on the numbers that just moved.
      field.animate([{ color: TICK.COLOR }, { color: 'inherit' }], TICK.MS);
    }
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function stat(name, label) {
    const cell = element('div', '');
    fields[name] = element('div', CLASS.VALUE);
    cell.append(fields[name], element('div', CLASS.LABEL, label));
    return cell;
  }

  function build() {
    const header = element('div', CLASS.HEADER);
    const reset = element('button', CLASS.RESET, TEXT.RESET);
    reset.type = 'button';
    reset.addEventListener('click', () => {
      totals = fresh();
      render();
    });
    header.append(element('span', CLASS.DOT), element('span', '', TEXT.TITLE), reset);

    const grid = element('div', CLASS.GRID);
    grid.append(
      stat('scanned', TEXT.SCANNED),
      stat('caught', TEXT.CAUGHT),
      stat('last', TEXT.LAST),
      stat('cost', TEXT.COST),
    );
    fields.foot = element('div', CLASS.FOOT);

    const root = element('aside', CLASS.PANEL);
    root.append(header, grid, fields.foot);
    return root;
  }

  // `usage` is null when the answer came from the worker's cache: the post still
  // counts as scanned, but nothing was scored, so time does not move.
  function record({ usage, isFlagged }) {
    totals.scanned++;
    if (isFlagged) totals.caught++;
    if (usage) {
      totals.requests++;
      totals.inputTokens += usage.inputTokens;
      totals.lastMs = usage.latencyMs;
      totals.totalMs += usage.latencyMs;
    }
    render();
  }

  function setEnabled(isEnabled) {
    if (isEnabled && !panel) {
      panel = build();
      document.body.append(panel);
      render();
    } else if (!isEnabled && panel) {
      panel.remove();
      panel = null;
    }
  }

  globalThis.ANUBIS_STATS = Object.freeze({ record, setEnabled });
})();
