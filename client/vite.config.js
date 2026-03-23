import { defineConfig } from 'vite';
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
export default defineConfig({
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
});
