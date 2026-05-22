import path from "path";
import react from "@vitejs/plugin-react-swc";
import legacy from "@vitejs/plugin-legacy";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: [
        "iOS >= 12",
        "Safari >= 12",
        "Chrome >= 80",
        "Firefox >= 78",
        "Edge >= 80",
      ],
      modernPolyfills: false,
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
    cssTarget: "safari13",
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
