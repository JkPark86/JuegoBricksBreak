import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: './index.html',
        juego: './juego.html'
      }
    }
  },
  server: {
    host: true,
    port: 3000
  }
})