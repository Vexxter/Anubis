// DOM text helpers shared by the site adapters.
const PARAGRAPH_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

globalThis.ANUBIS_DOM = Object.freeze({
  // Visible text of a node: emoji images by their alt text, <br> and the end of a
  // paragraph as a newline, and anything matching `skipSelector` (a "see more"
  // button, say) left out.
  readText(node, skipSelector = null) {
    let out = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += child.data;
      else if (child.nodeType !== Node.ELEMENT_NODE) continue;
      else if (skipSelector && child.matches(skipSelector)) continue;
      else if (child.nodeName === 'IMG') out += child.alt;
      else if (child.nodeName === 'BR') out += '\n';
      else {
        out += globalThis.ANUBIS_DOM.readText(child, skipSelector);
        // Without this, "<p>one.</p><p>Two.</p>" reads as "one.Two."
        if (PARAGRAPH_TAGS.has(child.nodeName)) out += '\n';
      }
    }
    return out;
  },
});
