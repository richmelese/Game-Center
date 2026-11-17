import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The telebirr SuperApp loads the mini-app from a local package, where web views refuse
 * `<script type="module" crossorigin>`. Emit a classic deferred script instead.
 */
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
        .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ');
    },
  };
}

export default defineConfig({
  // Relative asset URLs so the bundle also loads from the SuperApp's local mini-app package.
  base: './',
  plugins: [react(), tailwindcss(), classicScript()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Older Android web views inside the SuperApp: lower the syntax and ship one plain bundle.
    target: 'es2015',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: { format: 'iife' },
    },
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
});
