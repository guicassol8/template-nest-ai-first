import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    // E2E compartilha um único Postgres e a cota do throttler é por IP:
    // rodar em paralelo produz falha intermitente, não paralelismo.
    fileParallelism: false,
    testTimeout: 30_000,
    coverage: { reporter: ['text', 'lcov'] },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
