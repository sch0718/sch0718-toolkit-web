import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    svelte({ configFile: fileURLToPath(new URL('../../svelte.config.js', import.meta.url)) }),
  ],
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
});
