import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";

export default defineConfig({
  plugins: [wasp()],
  server: {
    open: false,
    // Env-driven so the isolated e2e worktree can run on :4100 alongside dev
    // on :4000 without colliding. Dev leaves VITE_PORT unset → 4000.
    port: Number(process.env.VITE_PORT ?? 4000),
  },
});
