import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  clean: true,
  dts: false,
  // No `banner` — `src/index.ts` carries the shebang itself, so `tsx src/index.ts` and the
  // built `dist/index.js` are executable the same way, and there is only ever one of them.
})
