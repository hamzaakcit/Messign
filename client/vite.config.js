var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
/** While the API restarts (tsx watch) or boots, the proxy can hit ECONNREFUSED; avoid noisy Vite logs. */
function quietTransientProxyErrors(proxy) {
    proxy.on('error', function (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')
            return;
        console.error('[vite-proxy]', err);
    });
}
/**
 * Vite still prints `[vite] http proxy error` / `ws proxy error` itself (not only http-proxy `error`).
 * Filter transient failures while 127.0.0.1:3001 is booting or restarting.
 */
function shouldIgnoreTransientProxyLog(msg) {
    var s = String(msg);
    /** Multiline proxy failures: first line has `proxy error`, stack lines only have `ECONNREFUSED`. */
    if (s.includes('127.0.0.1:3001') && /ECONNREFUSED|ECONNRESET/i.test(s))
        return true;
    if (!s.includes('proxy error'))
        return false;
    return /ECONNREFUSED|ECONNRESET|socket hang up/i.test(s);
}
function createDevLoggerQuietProxy() {
    var base = createLogger();
    var wrap = function (fn) { return function (msg, options) {
        if (shouldIgnoreTransientProxyLog(String(msg)))
            return;
        fn(msg, options);
    }; };
    return __assign(__assign({}, base), { warn: wrap(base.warn.bind(base)), warnOnce: wrap(base.warnOnce.bind(base)), error: wrap(base.error.bind(base)) });
}
/** The local API. DEV_API_PROXY_TARGET lets a second stack run beside the usual one (the engage browser tests use 3201). */
var API_TARGET = process.env.DEV_API_PROXY_TARGET || 'http://127.0.0.1:3001';
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
                target: API_TARGET,
                changeOrigin: true,
                // Avoid buffering SSE (Dora /api/.../ai/answer); default timeouts can stall streams.
                timeout: 0,
                proxyTimeout: 0,
                configure: quietTransientProxyErrors,
            },
            '/uploads': {
                target: API_TARGET,
                changeOrigin: true,
                configure: quietTransientProxyErrors,
            },
            '/socket.io': {
                target: API_TARGET,
                ws: true,
                changeOrigin: true,
                timeout: 0,
                proxyTimeout: 0,
                configure: quietTransientProxyErrors,
            },
        },
    },
});
