import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

/** BASE_PATH=/chapterzero/ for GitHub Pages project sites. */
const base = process.env.BASE_PATH ?? '/';

/** Serves fixtures/mini-pack at /test-packs/ in dev and preview (e2e tests only, never built). */
function testPacks(): Plugin {
  const dir = join(import.meta.dirname, '../../fixtures/mini-pack');
  const mw = (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(): void; statusCode: number } & NodeJS.WritableStream, next: () => void) => {
    const m = req.url?.match(/\/test-packs\/([\w.-]+)$/);
    if (!m) return next();
    const file = join(dir, m[1]);
    if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'test-packs',
    configureServer: (s) => void s.middlewares.use(mw as never),
    configurePreviewServer: (s) => void s.middlewares.use(mw as never),
  };
}

/**
 * The manifest link as an inline head script, the way the home-screen app that runs without browser controls on
 * the iPhone has it. Rewritten in generateBundle: vite-plugin-pwa injects the link after transformIndexHtml, and
 * this runs before the service worker precaches the page.
 */
function manifestByHeadScript(): Plugin {
  return {
    name: 'manifest-by-head-script',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['index.html'];
      if (page?.type !== 'asset' || typeof page.source !== 'string') return;
      page.source = page.source.replace(/<link rel="manifest" href="([^"]+)">/, (_m, href: string) =>
        `<script>(function () { var l = document.createElement('link'); l.rel = 'manifest'; l.href = ${JSON.stringify(href)}; document.head.appendChild(l); })();</script>`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    svelte(),
    testPacks(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.svg', 'favicon.ico'],
      manifest: {
        name: 'Chapter 0',
        short_name: 'Chapter 0',
        description: "Learn a book's rare words before you read it.",
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        background_color: '#101014',
        theme_color: '#101014',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the word packs go to IndexedDB, not the Cache API (README §9)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['packs/**'],
        navigateFallbackDenylist: [/\/packs\//, /\/test-packs\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
    manifestByHeadScript(),
  ],
  worker: { format: 'es' },
  build: { target: ['es2022', 'safari16'] },
  server: { host: true },
});
