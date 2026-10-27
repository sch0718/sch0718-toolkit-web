import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'fixtures', '.packs', '.compat'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['scripts/**', '*.config.{mjs,ts}'], languageOptions: { globals: globals.node } },
);
