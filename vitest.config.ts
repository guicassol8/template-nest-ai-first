import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { reporter: ['text', 'lcov'] },
  },
  // Sem o SWC os decorators e o emitDecoratorMetadata não funcionam no Vitest,
  // e todo teste que monta um módulo do Nest quebra na injeção de dependência.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
