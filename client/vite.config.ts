import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

type ProxyWithErrorEvent = {
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): void
}

/** While the API restarts (tsx watch) or boots, the proxy can hit ECONNREFUSED; avoid noisy Vite logs. */
function quietTransientProxyErrors(proxy: ProxyWithErrorEvent) {
  proxy.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') return
    console.error('[vite-proxy]', err)
  })
}

/**
 * Vite still prints `[vite] http proxy error` / `ws proxy error` itself (not only http-proxy `error`).
 * Filter transient failures while 127.0.0.1:3001 is booting or restarting.
 */
function shouldIgnoreTransientProxyLog(msg: string): boolean {
  const s = String(msg)
  /** Multiline proxy failures: first line has `proxy error`, stack lines only have `ECONNREFUSED`. */
  if (s.includes('127.0.0.1:3001') && /ECONNREFUSED|ECONNRESET/i.test(s)) return true
  if (!s.includes('proxy error')) return false
  return /ECONNREFUSED|ECONNRESET|socket hang up/i.test(s)
}

/** Widen Vite logger method signatures so `tsc -b` accepts the wrapper (LogOptions vs unknown). */
type LogFn = (msg: string, options?: unknown) => void

function createDevLoggerQuietProxy(): ReturnType<typeof createLogger> {
  const base = createLogger()
  const wrap = (fn: LogFn): LogFn => (msg: string, options?: unknown) => {
    if (shouldIgnoreTransientProxyLog(String(msg))) return
    fn(msg, options)
  }
  return {
    ...base,
    warn: wrap(base.warn.bind(base) as LogFn),
    warnOnce: wrap(base.warnOnce.bind(base) as LogFn),
    error: wrap(base.error.bind(base) as LogFn),
  }
}

export default defineConfig({
  customLogger: createDevLoggerQuietProxy(),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'd3': ['d3'],
          'recharts': ['recharts'],
          'framer': ['framer-motion'],
          'tiptap': [
            '@tiptap/react', '@tiptap/starter-kit',
            '@tiptap/extension-code-block-lowlight', '@tiptap/extension-highlight',
            '@tiptap/extension-image', '@tiptap/extension-link',
            '@tiptap/extension-placeholder', '@tiptap/extension-table',
            '@tiptap/extension-table-cell', '@tiptap/extension-table-header',
            '@tiptap/extension-table-row', '@tiptap/extension-task-item',
            '@tiptap/extension-task-list', '@tiptap/extension-underline',
          ],
          'unlayer': ['react-email-editor'],
          'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
  server: {
    // Listen on all interfaces so `localhost` (IPv4/IPv6) and `127.0.0.1` both work on macOS/Linux.
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // Avoid buffering SSE (Dora /api/.../ai/answer); default timeouts can stall streams.
        timeout: 0,
        proxyTimeout: 0,
        configure: quietTransientProxyErrors,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: quietTransientProxyErrors,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: quietTransientProxyErrors,
      },
    },
  },
})
