import { defineConfig } from 'vitest/config';
import path from 'path';

// Config dedicada de teste — NÃO herda o vite.config (react + singlefile), que é
// pesado pra rodar testes de módulo puro. Só o alias '@' e ambiente node.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
