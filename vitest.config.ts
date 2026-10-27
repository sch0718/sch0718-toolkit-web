import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'node', include: ['packages/*/src/**/*.test.ts'], environment: 'node' },
      },
      {
        plugins: [svelte({ configFile: 'packages/ui-svelte/svelte.config.js' }), svelteTesting()],
        // Svelte 5 컴포넌트 시험은 SSR이 아닌 클라이언트 빌드를 불러야 한다.
        resolve: { conditions: ['browser'] },
        test: {
          name: 'svelte',
          include: ['packages/ui-svelte/test/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
