import { defineConfig } from "vite";
import { imba } from "vite-plugin-imba";

export default defineConfig({
  plugins: [imba()],
  server: {
    port: 3131,
    proxy: {
      "/api": "http://localhost:8080",
      "/rpc": "http://localhost:8080",
    },
  },
});
