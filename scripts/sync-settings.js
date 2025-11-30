import fs from "node:fs/promises";
import path from "node:path";
import toml from "@iarna/toml";

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readToml(p) {
  const content = await fs.readFile(p, "utf-8");
  return toml.parse(content);
}

async function writeToml(p, obj) {
  const content = toml.stringify(obj);
  await fs.writeFile(p, content);
}

async function collectAreas() {
  const areasDir = path.join("data", "areas");
  const entries = await fs.readdir(areasDir, { withFileTypes: true });
  const areaDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const areas = [];
  for (const slug of areaDirs) {
    const areaPath = path.join(areasDir, slug, "area.toml");
    if (await fileExists(areaPath)) {
      const data = await readToml(areaPath);
      if (data && data.name) {
        areas.push({ slug, name: data.name });
      }
    }
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));
  return areas;
}

async function collectActiveProjects() {
  const areasDir = path.join("data", "areas");
  const entries = await fs.readdir(areasDir, { withFileTypes: true });
  const areaDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const projects = [];
  for (const area of areaDirs) {
    const base = path.join(areasDir, area);
    const sub = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    const projectDirs = sub.filter((e) => e.isDirectory()).map((e) => e.name);
    for (const slug of projectDirs) {
      const projectToml = path.join(base, slug, "project.toml");
      if (await fileExists(projectToml)) {
        const data = await readToml(projectToml);
        if (data && data.status === "active" && data.name) {
          const permalink = `/projects/${area}/${slug}`;
          projects.push({ name: data.name, area, slug, permalink });
        }
      }
    }
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

async function main() {
  const settingsPath = path.join("data", "config", "settings.toml");
  let settings = {};
  if (await fileExists(settingsPath)) {
    settings = await readToml(settingsPath);
  }
  const areas = await collectAreas();
  const projects = await collectActiveProjects();
  settings.areas = areas;
  settings.projects = projects;
  await writeToml(settingsPath, settings);
}

await main();
