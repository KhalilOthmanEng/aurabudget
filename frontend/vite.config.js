import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // Relative paths for Electron file:// or backend serving
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:48732",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk — framework code users cache across updates
          "vendor-react": ["react", "react-dom"],
          // Charts only needed on Dashboard — isolated so other pages never load it
          "vendor-charts": ["recharts"],
          // Date utilities
          "vendor-date": ["date-fns"],
        },
      },
    },
  },
});
