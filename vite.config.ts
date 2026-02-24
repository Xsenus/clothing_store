import path from 'path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [react(),
  nodePolyfills({
    globals: { global: true, process: true, Buffer: true },
    overrides: {
      path: 'path-browserify-win32',
    },
  }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr:
      process.env.DAYTONA_SANDBOX_ID ?
        {
          host: `5173-${process.env.DAYTONA_SANDBOX_ID}.proxy.daytona.works`,
          protocol: 'wss',
          clientPort: 443,
        } : undefined,
  },
});