import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";
import tidewave from 'tidewave/vite-plugin';

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

// Emit a static version manifest into public/ at config-eval time so the
// deployed host serves /version.json. The client polls it (see
// notifications/client.ts → useDeployedVersionUpdate) and compares against the
// build-time __APP_VERSION__ baked into the bundle — a mismatch means a newer
// build has shipped and the tab should offer to refresh. Written here (not in a
// plugin hook) so it exists for both dev (served from disk) and prod (copied
// into build output by Vite's public-dir handling). In dev the SHA matches
// __APP_VERSION__, so no banner shows locally. Build artifact — gitignored.
const VERSION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "public",
  "version.json",
);
try {
  mkdirSync(dirname(VERSION_FILE), { recursive: true });
  writeFileSync(
    VERSION_FILE,
    `${JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
} catch {
  // Non-fatal — the client poll also fails silently if the file is absent.
}

export default defineConfig({
  plugins: [tidewave(), wasp()],
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
