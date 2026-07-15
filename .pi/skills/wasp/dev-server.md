# Start the Wasp Dev Server (with full debugging visibility)

Load this when starting or restarting the development environment, or when you need server logs / build errors / browser console access to debug.

## Step 0: Ask the user how they want the server run

Ask the user (plain question — no special tool needed) whether they want:

- **Background task in this session**
  - Pros: the agent has autonomy and can respond directly to dev-server logs (warnings, errors).
  - Cons: some actions are slower; server logs are only visible to the user from the background-tasks view.
- **External (user runs it in their own terminal)**
  - Pros: user has direct control over app development and Wasp CLI commands. Better for advanced users.
  - Cons: debugging/discovery is slower because the agent has no direct access to logs.

Then either run the commands as background tasks, or guide the user through running them manually.

> **Pi note:** use `bash` with an unbounded timeout or a background-style invocation to run `wasp start` so it doesn't block. Confirm the user's preference first.

---

## Step 1: Ensure the development database is running

Grep `webapp/.env.server` for `DATABASE_URL`. If a line starts with `DATABASE_URL`, the user has their own DB — skip to Step 2.

Otherwise, check `webapp/schema.prisma`'s `datasource` block:

### SQLite
**Skip to Step 2.** SQLite stores data in a local file; no DB server is needed.

### PostgreSQL
**This repo's provider.** The dev DB is Homebrew Postgres on `localhost:5432` (see `DATABASE_URL` in `webapp/.env.server`) — ensure it's running (`brew services list` / `lsof -i :5432`) before starting Wasp. If the project instead relied on the managed container, start it as a background task:

```bash
cd webapp && wasp start db
```

**Docker must be installed and running** for `wasp start db` (managed Postgres container). Wait 5–15s for it to be ready.

---

## Step 2: Start the dev server

```bash
cd webapp && wasp start
```

Frontend → `localhost:4000`, backend → `localhost:3001` (this repo sets `WASP_WEB_CLIENT_URL=http://localhost:4000` in `webapp/.env.server`; the default is 3000 — read `.env.server` rather than assuming).

If this is the first start or there are pending migrations:

```bash
cd webapp && wasp db migrate-dev --name <migration-name>
```

---

## Step 3: Verify it's running

Confirm the client and server are up by checking the command output / background-task output. The client runs at the value of `WASP_WEB_CLIENT_URL` in `webapp/.env.server` (this repo: `localhost:4000`; default 3000) and the server at `PORT` (default 3001).

- **Background task:** listen to the output for dev/debug info.
- **External:** ask the user to share the output of the external terminal.

---

## Step 4: Connect browser console access (important for debugging)

Without browser-console access the agent cannot see client-side errors, React warnings, or network issues. Ask the user which they prefer:

| Option | Notes |
|---|---|
| **Browser-harness skill** (recommended in Pi) | Use Pi's built-in `browser-harness` skill (connects to the user's running Chrome via CDP). Check it's available first. |
| **playwright-cli skill** | Use Pi's `playwright-cli` skill for automated browser inspection/screenshots. |
| **Chrome DevTools MCP** (if installed) | Add to the user's MCP client: `npx -y chrome-devtools-mcp@latest` under `mcpServers.chrome-devtools`. |
| **Manual** | The user copy/pastes console output when asked. |

Pick whatever is available in the current environment; don't force a specific tool.
