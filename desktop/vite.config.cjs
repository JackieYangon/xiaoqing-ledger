const { defineConfig } = require('vite')
const vue = require('@vitejs/plugin-vue')
const path = require('node:path')
module.exports = defineConfig({
  root: path.resolve(__dirname, 'ui'),
  plugins: [vue()],
  base: './',
  build: { outDir: path.resolve(__dirname, '../dist/desktop-ui'), emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
})
