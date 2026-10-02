// State shared by the content-script modules, and the one way they talk to the worker.
(() => {
  const { DEFAULTS } = globalThis.ANUBIS;
  const content = globalThis.ANUBIS_CONTENT;

  content.state = Object.freeze({
    settings: { ...DEFAULTS },
    results: new Map(), // post id -> { p, features, ... } as the worker answered
    revealed: new Set(), // post ids the user chose to show
    labeled: new Map(), // post id -> label given this session
    animated: new Set(), // post ids whose inspection already played
    offered: new Set(), // handles whose block offer was declined
    awaitingStage: new WeakMap(), // element -> post
    bars: new WeakMap(), // element -> its bar
    animating: new WeakSet(),
    seen: new WeakSet(),
  });

  // Rejects with an Error carrying the worker's `code` and `detail`.
  content.send = (message) =>
    chrome.runtime.sendMessage(message).then((response) => {
      if (response?.ok) return response.result;
      const error = new Error(response?.error ?? 'No response from background worker');
      error.detail = response?.detail ?? '';
      error.code = response?.code ?? null;
      throw error;
    });

  content.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
})();
