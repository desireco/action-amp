#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');
const FOLDERS = {
  spec: path.join(DOCS, 'specs'),
  backlog: path.join(DOCS, 'backlog'),
  task: path.join(DOCS, 'tasks'),
  bug: path.join(DOCS, 'tasks'),
  feature: path.join(DOCS, 'features'),
  review: path.join(DOCS, 'reviews'),
};

const STATUS_ORDER = new Map([
  ['ready', 0],
  ['draft', 1],
  ['blocked', 2],
  ['review', 3],
  ['building', 4],
  ['done', 5],
]);
const PRIORITY_ORDER = new Map([
  ['P0', 0],
  ['P1', 1],
  ['P2', 2],
  ['P3', 3],
]);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) {
    printHelp();
    return;
  }

  switch (command) {
    case 'init':
      init();
      break;
    case 'capture':
      capture(parseArgs(args));
      break;
    case 'queue':
      queue(parseArgs(args));
      break;
    case 'set-status':
      setStatus(parseArgs(args));
      break;
    case 'validate':
      validate(parseArgs(args));
      break;
    default:
      throw new Error(`Unknown duet command: ${command}`);
  }
}

function printHelp() {
  console.log(`Duet workflow helper\n\nCommands:\n  init                       Create docs scaffolding\n  capture <kind> <title>     Create a draft work unit\n  queue                      List work units by priority/status\n  set-status <file> <status> Update frontmatter status\n  validate [paths...]        Validate duet docs\n\nExamples:\n  node scripts/duet.mjs init\n  node scripts/duet.mjs capture spec "Add onboarding" --feature onboarding --priority P1\n  node scripts/duet.mjs queue\n  node scripts/duet.mjs set-status docs/specs/onboarding.md ready\n  node scripts/duet.mjs validate docs/specs/onboarding.md`);
}

function init() {
  ensureDir(DOCS);
  for (const dir of Object.values(FOLDERS)) ensureDir(dir);
  writeIfMissing(path.join(DOCS, 'ROADMAP.md'), roadmapTemplate());
  writeIfMissing(path.join(DOCS, 'queue.md'), queueTemplate());
  writeIfMissing(path.join(FOLDERS.feature, '.gitkeep'), '');
  writeIfMissing(path.join(FOLDERS.review, '.gitkeep'), '');
  console.log('Initialized duet docs scaffold.');
}

function capture(argv) {
  const kind = (argv._[0] || '').toLowerCase();
  const title = argv._.slice(1).join(' ').trim();
  if (!kind || !title) {
    throw new Error('capture requires <kind> <title>');
  }

  const normalizedKind = normalizeKind(kind);
  const slug = uniqueSlug(slugify(title), folderForKind(normalizedKind));
  const priority = normalizePriority(argv.priority || 'P1');
  const feature = argv.feature || (normalizedKind === 'spec' ? slug : '');
  const created = today();
  const frontmatter = {
    id: slug,
    kind: normalizedKind,
    title,
    status: 'draft',
    priority,
    feature: feature || undefined,
    parent: argv.parent || undefined,
    spec_owner: normalizedKind === 'spec' ? 'discover' : undefined,
    build_owner: normalizedKind === 'spec' ? 'build' : undefined,
    created,
  };

  const unitPath = path.join(folderForKind(normalizedKind), `${slug}.md`);
  if (fs.existsSync(unitPath)) throw new Error(`Work unit already exists: ${unitPath}`);
  writeFile(unitPath, renderUnit(frontmatter, normalizedKind));

  if (normalizedKind === 'spec') {
    const featurePath = path.join(FOLDERS.feature, `${slug}.md`);
    if (!fs.existsSync(featurePath)) {
      writeFile(featurePath, renderFeature(frontmatter));
    }
  }

  console.log(unitPath);
}

function queue() {
  const units = collectUnits();
  if (!units.length) {
    console.log('No duet work units found.');
    return;
  }

  console.log(['status', 'priority', 'kind', 'id', 'title', 'path'].join('\t'));
  for (const unit of units) {
    console.log([unit.status, unit.priority, unit.kind, unit.id, unit.title, path.relative(ROOT, unit.path)].join('\t'));
  }
}

function setStatus(argv) {
  const file = argv._[0];
  const status = argv._[1];
  if (!file || !status) {
    throw new Error('set-status requires <file> <status>');
  }
  if (!STATUS_ORDER.has(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const fullPath = resolveWorkFile(file);
  const doc = readDocument(fullPath);
  doc.frontmatter.status = status;
  writeFile(fullPath, renderDocument(doc.frontmatter, doc.body));
  console.log(`${path.relative(ROOT, fullPath)} -> ${status}`);
}

function validate(argv) {
  const paths = argv._.length ? argv._ : collectUnits().map((unit) => path.relative(ROOT, unit.path));
  let errors = 0;
  for (const input of paths) {
    const fullPath = resolveMaybe(input);
    if (!fullPath || !fs.existsSync(fullPath)) {
      console.error(`Missing: ${input}`);
      errors += 1;
      continue;
    }
    if (!fullPath.endsWith('.md')) continue;
    const rel = path.relative(ROOT, fullPath);
    if (rel.startsWith('docs/reviews/')) continue;
    try {
      const doc = readDocument(fullPath);
      validateFrontmatter(doc.frontmatter, rel);
      if (isSpec(rel) && doc.frontmatter.status === 'ready') {
        requireSection(doc.body, '## Summary', rel);
        requireSection(doc.body, '## Why', rel);
        requireSection(doc.body, '## Done-conditions', rel);
        requireSection(doc.body, '## Non-goals', rel);
        requireSection(doc.body, '## Open questions', rel);
      }
    } catch (error) {
      if (!isSpec(rel) && String(error).includes('missing YAML frontmatter')) continue;
      errors += 1;
      console.error(`${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors) process.exit(1);
  console.log(`Validated ${paths.length} file(s).`);
}

function collectUnits() {
  const units = [];
  for (const folder of [FOLDERS.spec, FOLDERS.backlog, FOLDERS.task]) {
    if (!fs.existsSync(folder)) continue;
    for (const file of walk(folder)) {
      if (!file.endsWith('.md')) continue;
      const rel = path.relative(ROOT, file);
      if (rel === 'docs/ROADMAP.md' || rel === 'docs/queue.md') continue;
      const doc = readDocument(file);
      if (!doc.frontmatter.kind) continue;
      if (doc.frontmatter.status === 'done') continue;
      units.push({
        id: doc.frontmatter.id || path.basename(file, '.md'),
        kind: doc.frontmatter.kind,
        title: doc.frontmatter.title || path.basename(file, '.md'),
        status: doc.frontmatter.status || 'draft',
        priority: doc.frontmatter.priority || 'P3',
        path: file,
      });
    }
  }
  return units.sort((a, b) => {
    const status = (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99);
    if (status !== 0) return status;
    const pr = (PRIORITY_ORDER.get(a.priority) ?? 99) - (PRIORITY_ORDER.get(b.priority) ?? 99);
    if (pr !== 0) return pr;
    return a.id.localeCompare(b.id);
  });
}

function validateFrontmatter(fm, rel) {
  const required = ['id', 'kind', 'title', 'status', 'priority', 'created'];
  for (const key of required) {
    if (!fm[key]) throw new Error(`missing frontmatter key: ${key}`);
  }
  if (!['spec', 'backlog', 'task', 'bug', 'feature'].includes(fm.kind)) {
    throw new Error(`invalid kind: ${fm.kind}`);
  }
  if (!STATUS_ORDER.has(fm.status)) {
    throw new Error(`invalid status: ${fm.status}`);
  }
  if (!PRIORITY_ORDER.has(fm.priority)) {
    throw new Error(`invalid priority: ${fm.priority}`);
  }
  if (isSpec(rel) && fm.kind !== 'spec') {
    throw new Error('spec files must have kind: spec');
  }
}

function requireSection(body, heading, rel) {
  if (!body.includes(heading)) {
    throw new Error(`missing required section: ${heading}`);
  }
}

function readDocument(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('missing YAML frontmatter');
  return { frontmatter: parseFrontmatter(match[1]), body: match[2] };
}

function parseFrontmatter(block) {
  const fm = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    fm[key] = value;
  }
  return fm;
}

function renderUnit(fm, kind) {
  const sections = [
    `# ${kindLabel(kind)}: ${fm.title}`,
    '## Summary',
    '',
    '## Why',
    '',
    '## Done-conditions',
    '',
    '- TODO',
    '',
    '## Non-goals',
    '',
    '- TODO',
    '',
    '## Open questions',
    '',
    '- None',
    '',
    '## Prototypes',
    '',
    '- None',
  ];
  return renderDocument(fm, sections.join('\n'));
}

function renderFeature(fm) {
  const body = [
    `# Feature: ${fm.title}`,
    '',
    '## Summary',
    '',
    '## User value',
    '',
    '## Notes',
  ].join('\n');
  return renderDocument(
    {
      id: fm.id,
      kind: 'feature',
      title: fm.title,
      status: 'draft',
      priority: fm.priority,
      feature: fm.id,
      created: fm.created,
    },
    body,
  );
}

function renderDocument(fm, body) {
  return `---\n${renderFrontmatter(fm)}---\n${body.endsWith('\n') ? body : `${body}\n`}`;
}

function renderFrontmatter(fm) {
  const order = ['id', 'kind', 'title', 'status', 'priority', 'feature', 'parent', 'spec_owner', 'build_owner', 'created'];
  const lines = [];
  for (const key of order) {
    if (fm[key] === undefined || fm[key] === '') continue;
    lines.push(`${key}: ${fm[key]}`);
  }
  return `${lines.join('\n')}\n`;
}

function roadmapTemplate() {
  return `# Roadmap\n\nUse this file for prioritized feature direction.\n\n## Now\n\n-\n\n## Next\n\n-\n\n## Later\n\n-\n`;
}

function queueTemplate() {
  return [
    '# Queue',
    '',
    'Duet work units are captured in docs/specs, docs/backlog, and docs/tasks.',
    '',
    '- Build pulls highest-priority `ready` units.',
    '- Discover pulls highest-priority `draft` units.',
    '- Status changes happen via `node scripts/duet.mjs set-status`.',
    '',
  ].join('\n');
}

function normalizeKind(kind) {
  if (kind === 'bug') return 'bug';
  if (['spec', 'backlog', 'task', 'feature'].includes(kind)) return kind;
  throw new Error(`Invalid kind: ${kind}`);
}

function kindLabel(kind) {
  return kind === 'bug' ? 'Bug' : kind.charAt(0).toUpperCase() + kind.slice(1);
}

function folderForKind(kind) {
  if (kind === 'spec') return FOLDERS.spec;
  if (kind === 'backlog') return FOLDERS.backlog;
  if (kind === 'task' || kind === 'bug') return FOLDERS.task;
  if (kind === 'feature') return FOLDERS.feature;
  throw new Error(`Unsupported kind: ${kind}`);
}

function normalizePriority(priority) {
  const value = String(priority).toUpperCase();
  if (!PRIORITY_ORDER.has(value)) throw new Error(`Invalid priority: ${priority}`);
  return value;
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(base, folder) {
  let slug = base || 'untitled';
  let i = 2;
  while (fs.existsSync(path.join(folder, `${slug}.md`))) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

function walk(dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function writeIfMissing(file, content) {
  if (fs.existsSync(file)) return;
  writeFile(file, content);
}

function resolveWorkFile(input) {
  const full = resolveMaybe(input);
  if (!full) throw new Error(`Cannot resolve file: ${input}`);
  return full;
}

function resolveMaybe(input) {
  if (path.isAbsolute(input)) return input;
  return path.resolve(ROOT, input);
}

function isSpec(rel) {
  return rel.startsWith('docs/specs/') || rel.startsWith('docs/backlog/') || rel.startsWith('docs/tasks/');
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=');
      if (inline !== undefined) {
        out[key] = inline;
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          out[key] = next;
          i += 1;
        } else {
          out[key] = true;
        }
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

today();
function today() {
  return new Date().toISOString().slice(0, 10);
}
