import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const openaiProxy: ProxyOptions = {
  target: 'https://api.openai.com',
  changeOrigin: true,
  rewrite: (path) => (path.includes('models') ? '/v1/models' : '/v1/chat/completions'),
}

const whoopTokenProxy: ProxyOptions = {
  target: 'https://api.prod.whoop.com',
  changeOrigin: true,
  rewrite: () => '/oauth/oauth2/token',
}

const whoopDeveloperProxy: ProxyOptions = {
  target: 'https://api.prod.whoop.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/whoop\/developer/, '/developer'),
}

const whoopProxy = {
  '/api/openai': openaiProxy,
  '/api/whoop/token': whoopTokenProxy,
  '/api/whoop/developer': whoopDeveloperProxy,
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    proxy: whoopProxy,
  },
  preview: {
    proxy: whoopProxy,
  },
})
