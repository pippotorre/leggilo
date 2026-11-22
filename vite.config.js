import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

process.env.VITE_VERSIONE ??= JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version

// In sviluppo /api viene inoltrato a KAVITA_URL (es. un Kavita di prova).
const kavita = process.env.KAVITA_URL || 'http://localhost:5000'

export default defineConfig({
  base: './',
  server: { proxy: { '/api': { target: kavita, changeOrigin: true } } },
  preview: { proxy: { '/api': { target: kavita, changeOrigin: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,mjs,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      includeAssets: ['logo.svg', 'favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Leggilo',
        short_name: 'Leggilo',
        description: 'Leggi e ascolta i tuoi ebook',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#F7F3EC',
        background_color: '#F7F3EC',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android: "Condividi → Leggilo" per EPUB e PDF (solo con l'app installata)
        share_target: {
          action: './condividi',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            files: [{ name: 'libri', accept: ['application/epub+zip', '.epub', 'application/pdf', '.pdf', 'application/octet-stream'] }],
          },
        },
      },
    }),
  ],
})
