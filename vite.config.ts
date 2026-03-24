import path from "path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { global: true, process: true, Buffer: true },
      overrides: {
        path: "path-browserify-win32",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("framer-motion")) {
            return "motion-vendor";
          }

          if (id.includes("recharts")) {
            return "charts-vendor";
          }

          if (id.includes("@stripe") || id.includes("stripe")) {
            return "payments-vendor";
          }

          if (id.includes("react-router")) {
            return "router-vendor";
          }
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
    hmr: process.env.DAYTONA_SANDBOX_ID
      ? {
          host: `5173-${process.env.DAYTONA_SANDBOX_ID}.proxy.daytona.works`,
          protocol: "wss",
          clientPort: 443,
        }
      : undefined,
  },
});
