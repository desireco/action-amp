# Pre-Deployment Validation

Validation checks that catch common issues before deploying with the `wasp-deploy` skill.

## Before Starting

1. Verify you're in the app directory (`webapp/`) — check for `webapp/main.wasp.ts` (or `main.wasp`).
2. Ask: "Would you like me to run pre-deployment checks on your app?"

Run these checks in order. Report **all** issues found, then ask the user if they want to proceed or fix issues first.

---

## Step 1: Wasp Config Metadata

Check the Wasp config (`webapp/main.wasp.ts`) for placeholder values:

- URLs are actual live URLs, not the placeholder values set during the setup wizard.
- Email provider and default from-address are actual live email addresses (not `hello@example.com`).
- Auth provider client IDs/secrets are referenced (via env vars), not still set to placeholders.

Report format:

```
## Configuration Issues Found

### Critical (must fix):
- [ ] issue description

### Warnings (recommended to fix):
- [ ] issue description

### Passed:
- [x] check that passed
```

---

## Step 2: Environment Variables

Based on the Wasp config and the app's features, generate a checklist of required env vars for the user to verify (from the "Env Variables" docs section).

**Auto-set by `wasp deploy` (Railway/Fly.io) — no action needed:**
- `DATABASE_URL`
- `WASP_WEB_CLIENT_URL`
- `WASP_SERVER_URL`
- `JWT_SECRET`
- `PORT`

**You must set manually** — anything for features you've configured (OAuth client IDs/secrets, email provider keys, custom vars). List them.

---

## Step 3: Database — SQLite → PostgreSQL

If `webapp/schema.prisma` still uses `provider = "sqlite"`, this is a **blocker**:
- SQLite is dev-only; Wasp cannot build for production with it.
- Switch to `provider = "postgresql"` and run `wasp db migrate-dev --name switch-to-postgres` before deploying.

---

## Step 4: Database Migrations

Check for pending migrations:

```bash
ls -la webapp/migrations/
```

Remind the user:
- Production **automatically** applies pending migrations on server start.
- Ensure migrations are committed to version control.
- Test migrations work locally before deploying.

---

## Step 5: Production Build Test

Ask: "Would you like to test the production build locally? This catches environment-specific issues."

If yes, guide them through the "Testing the build locally" section of the docs:

```bash
cd webapp && wasp build
```

Then run the built server locally per the docs to smoke-test.

---

## Step 6: Final Checklist

Present a summary:

```
## Pre-Deployment Summary

### Configuration Status:
- App Name: [name]
- App Title: [title]
- Email Provider: [provider]
- Auth Methods: [list]
- Other integrations: [list]

### Issues to Resolve:
[list any issues from steps 1–4]

### Before Deploying:
- [ ] All configuration placeholders replaced
- [ ] Production email provider configured
- [ ] Required env vars ready for deployment
- [ ] SQLite → PostgreSQL migration done (if applicable)
- [ ] Production build tested locally (optional but recommended)
- [ ] Database migrations committed

### Ready to Deploy?
```

## Completion

If all checks pass or the user chooses to proceed:
- Summarize what was validated.
- Ask: "Would you like to proceed with deployment? I can guide you through deploying to Fly.io or Railway automatically with Wasp's CLI commands."
- If yes → return to the `wasp-deploy` skill for the deploy steps.
