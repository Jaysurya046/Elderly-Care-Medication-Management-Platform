import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  noExternal: ['@elder-care/core', '@elder-care/db', '@elder-care/email'],
});
