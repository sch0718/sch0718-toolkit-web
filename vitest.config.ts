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
        // 워크스페이스 패키지는 빌드 전에도 원본으로 시험한다(verify는 시험 뒤에 빌드한다).
        resolve: {
          conditions: ['browser'],
          alias: {
            '@sch0718/token-check': new URL('packages/token-check/src/index.ts', import.meta.url)
              .pathname,
          },
        },
        test: {
          name: 'svelte',
          include: ['packages/ui-svelte/test/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
