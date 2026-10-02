import js from '@eslint/js';
import globals from 'globals';

// Content scripts, the page-side helpers and the options page are classic scripts: the
// browser loads them without a module system, so they share `globalThis`. Everything else
// under src/ is an ES module.
const CLASSIC_SCRIPTS = [
  'src/constants.js',
  'src/dom-text.js',
  'src/options.js',
  'src/stats-panel.js',
  'src/sites/*.js',
  'src/content/*.js',
];

export default [
  { ignores: ['dist/**', 'vendor/**', 'model/**', 'node_modules/**', 'training/**'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    files: CLASSIC_SCRIPTS,
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
];
