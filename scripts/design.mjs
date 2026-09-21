#!/usr/bin/env node
// Open Design — launch the OpenDesign app mapped to ActionAmp's design folders.
//
//   npm run design        # or: node scripts/design.mjs
//
// Idempotent: each mapping below is imported once as an OpenDesign project
// (tracked by its baseDir), then the app opens on the primary project.
// The import drops an `.open-design/` manifest inside each mapped folder
// (gitignored).
//
// Requires the OpenDesign daemon on 127.0.0.1:7456 — docker compose up -d
// in ~/Work/open-design/deploy.
import { execFileSync, spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OD_URL = process.env.OD_URL ?? "http://127.0.0.1:7456";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Design-relevant roots of this repo -> OpenDesign projects.
const MAPPINGS = [
  { dir: "web", name: "ActionAmp Web" },
  { dir: "docs", name: "ActionAmp Design Docs" },
];
const OPEN_ON = "ActionAmp Web";

async function api(path, init) {
  const resp = await fetch(`${OD_URL}${path}`, init);
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${resp.status} ${JSON.stringify(body)}`);
  }
  return resp.json();
}

function openInBrowser(url) {
  for (const opener of ["omarchy-launch-webapp", "xdg-open", "open"]) {
    try {
      execFileSync("which", [opener], { stdio: "ignore" });
    } catch {
      continue;
    }
    spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  console.log(url);
}

const mappings = MAPPINGS.map((m) => ({ ...m, baseDir: join(REPO_ROOT, m.dir) }));

try {
  await fetch(`${OD_URL}/api/health`);
} catch {
  console.error(`Open Design daemon is not reachable at ${OD_URL}.`);
  console.error("Start it with: docker compose up -d (in ~/Work/open-design/deploy)");
  process.exit(1);
}

const { projects } = await api("/api/projects");
const existing = new Map(
  projects
    .filter((p) => typeof p?.metadata?.baseDir === "string")
    .map((p) => [p.metadata.baseDir, p.id]),
);

let primaryId = null;
for (const { baseDir, name, dir } of mappings) {
  let id = existing.get(baseDir);
  if (!id) {
    console.log(`Mapping ${dir}/ into Open Design as "${name}"…`);
    try {
      const created = await api("/api/import/folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseDir, name }),
      });
      id = created.project.id;
    } catch (err) {
      if (/folder not found/.test(String(err))) {
        console.error(
          `The Open Design daemon cannot see ${baseDir} — the container lacks ` +
            `the bind mount. Recreate it once:\n` +
            `  cd ~/Work/open-design/deploy\n` +
            `  sudo -E docker compose -f docker-compose.yml -f docker-compose.linux.yml ` +
            `-f docker-compose.mindupload.yml -f docker-compose.actionamp.yml up -d --pull never`,
        );
        process.exit(1);
      }
      throw err;
    }
  }
  if (name === OPEN_ON) primaryId = id;
}

if (primaryId) {
  openInBrowser(`${OD_URL}/projects/${primaryId}`);
} else {
  openInBrowser(OD_URL);
}
