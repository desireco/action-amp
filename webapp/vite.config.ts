import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";

// Embedded at build time so the deployed bundle can report what commit it
// was built from (Settings → About, login footer, support/debug signal).
// Fallback to "dev" if git isn't available (e.g. an exported tarball).
const APP_VERSION = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim() || "dev";
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  plugins: [wasp()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    open: false,
    // Env-driven so the isolated e2e worktree can run on :4100 alongside dev
    // on :4000 without colliding. Dev leaves VITE_PORT unset → 4000.
    port: Number(process.env.VITE_PORT ?? 4000),
  },
});
