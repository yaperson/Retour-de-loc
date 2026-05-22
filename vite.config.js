import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Si votre application est sur https://votre-nom.github.io/nom-du-depot/
  // remplacez './' par '/nom-du-depot/' (avec les slashs). 
  // './' (relatif) fonctionne souvent bien si c'est à la racine.
  base: './', 
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Contrôle Matériel Médical',
        short_name: 'Contrôle',
        description: 'Application de suivi et contrôle du matériel médical',
        theme_color: '#0ea5e9',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // Option pour garder une grande quantité de cache si nécessaire (ex: images)
        maximumFileSizeToCacheInBytes: 5000000 
      }
    })
  ]
})
