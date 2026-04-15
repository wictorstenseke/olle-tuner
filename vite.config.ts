import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

const isCI = process.env.CI === 'true'

// Local HTTPS certs for iPad testing
const httpsConfig = !isCI && fs.existsSync('.certs/cert.pem')
  ? { cert: fs.readFileSync('.certs/cert.pem'), key: fs.readFileSync('.certs/key.pem') }
  : undefined

export default defineConfig({
  base: '/olle-tuner/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Olle Tuner — Loop Station',
        short_name: 'Olle Tuner',
        description: 'Guitar loop recorder & tuner',
        theme_color: '#1a1a1a',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    https: httpsConfig,
  },
})
