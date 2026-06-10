import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/GradientDescent/',
  plugins: [
    svelte(),
    // Offline support: lecture-hall wifi is not a dependency. Precaches the
    // app shell (incl. the lazy three.js chunk and KaTeX fonts); updates
    // activate automatically on the next visit.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      },
      manifest: {
        name: 'Gradient Descent Explorer',
        short_name: '∂ Descent',
        description:
          'Interactive playground for learning gradient-based optimization: loss landscapes in 1D/2D/3D, six optimizers, races, basins of attraction, and a built-in course.',
        theme_color: '#0a1218',
        background_color: '#0a1218',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  }
})
