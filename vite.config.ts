import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Deliberately uncommon ports so this app never collides with the usual
 * suspects (3000, 5173, 8000, 8080, 4200, ...). `strictPort: true` makes Vite
 * fail loudly instead of silently hopping to another port.
 */
const DEV_PORT = 8137;
const PREVIEW_PORT = 8138;

// Vite + React SPA configuration.
// The `test` block is read by Vitest (the calculation engine is pure TypeScript
// and runs in a plain Node environment — no DOM needed).
export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
    strictPort: true,
  },
  preview: {
    port: PREVIEW_PORT,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

