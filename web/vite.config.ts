import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Listen on all interfaces so the app is reachable over the tailnet
    // (e.g. http://100.95.251.48:5174). Local-only: unset this to revert.
    host: true,
    // 5173 belongs to another project on this machine — web owns 5174.
    port: 5174,
    proxy: {
      // Dev-proxy standard: the Hono server (api) on 8080, same-origin.
      "/api": "http://localhost:8080",
      "/rpc": "http://localhost:8080",
    },
  },
});
