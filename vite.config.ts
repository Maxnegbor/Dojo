import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function openaiProxy(apiKey: string): ProxyOptions {
  return {
    target: 'https://api.openai.com',
    changeOrigin: true,
    rewrite: (path) => (path.includes('models') ? '/v1/models' : '/v1/chat/completions'),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
        else proxyReq.removeHeader('authorization')
      })
    },
  }
}

const whoopTokenProxy: ProxyOptions = {
  target: 'https://api.prod.whoop.com',
  changeOrigin: true,
  rewrite: () => '/oauth/oauth2/token',
}

const whoopDeveloperProxy: ProxyOptions = {
  target: 'https://api.prod.whoop.com',
  changeOrigin: true,
  rewrite: (incoming) => {
    const url = new URL(incoming, 'http://localhost')
    const whoopPath = url.searchParams.get('path') || ''
    url.searchParams.delete('path')
    const search = url.searchParams.toString()
    return `/developer/${whoopPath}${search ? `?${search}` : ''}`
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL('.', import.meta.url).pathname, '')
  const whoopProxy = {
    '/api/openai': openaiProxy(env.OPENAI_API_KEY?.trim() ?? ''),
    '/api/whoop/token': whoopTokenProxy,
    '/api/whoop/proxy': whoopDeveloperProxy,
  }
  return {
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
  }
})
