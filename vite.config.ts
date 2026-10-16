import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Node server (npm start) handles /api; run it on port 8787 alongside vite.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: { globals: true, environment: "node" },
});
