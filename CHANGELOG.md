# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-03

First release of Anubis.

### Added

- On-device scoring: the multilingual Laya encoder (INT8, ONNX) runs in WebAssembly inside the extension, with a small linear classifier on its output. No network requests, no account, no cost per post.
- Collapse, animated, dim, and badge modes for exiled posts, with a threshold slider.
- AI / Human label buttons, an account block list, and export and import for both.
- Persistent score cache in IndexedDB.
- Chrome (116 or newer) and Firefox or Zen (140 or newer).
