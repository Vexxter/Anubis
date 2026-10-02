# Contributing to Anubis

1. Run `npm install`, then `npm run lint` and `npm test`. Both must pass before and after your change.
2. Load the folder unpacked in Chrome 116 or newer (see the README) and try it on x.com. Check Firefox too when you touch the background worker or the manifest.
3. Keep changes small. There is no build step and no bundler: files in `src/` run as written. See [docs/development.md](docs/development.md) for how the content scripts share code without modules.
4. A change to the classifier or model needs a measured before and after, using the scripts in `training/`, and a bumped `MODEL_VERSION` in `src/constants.js`.
5. Dependencies in `vendor/` are copied from npm. Add a license file next to anything you add.

Bugs: say your browser and version, whether the options page shows the model as Ready, and the console output of the background worker (`chrome://extensions` → Inspect views, or `about:debugging` → Inspect).

Licensed under MIT, like the rest of the project.
