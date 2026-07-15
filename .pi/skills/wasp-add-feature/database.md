# Database Setup

Configure or switch the database for the Wasp app.

## Prerequisites

- Fetch the list of supported databases from the **Data Model → Databases** section of the versioned Wasp docs.

## Steps

1. **Display the full list** of supported databases to the user (e.g. PostgreSQL, SQLite).

2. Ask the user which database they'd like to use:
   - Highlight the popular options (PostgreSQL, SQLite) as quick picks.
   - Remind them they can name another option from the full list.

3. If the selected database can be managed locally by Wasp (e.g. PostgreSQL via `wasp start db`), ask the user: **"Would you like me to guide you through the local database setup process?"**
   - **Yes** → guide them through the managed-database setup per the docs (typically: update `schema.prisma` `datasource` provider, run `wasp db migrate-dev`, optionally `wasp start db` for a Docker-managed Postgres).
   - **No** → tell them they'll need to set the proper env vars (`DATABASE_URL`) themselves after setting up the DB.

## Notes

- **SQLite** is dev-only. Wasp cannot build for production with SQLite — you must switch to PostgreSQL before deploying. See the `wasp-deploy` skill and the docs' "Migrating from SQLite to PostgreSQL" guide.
- Changing the `datasource` provider in `schema.prisma` requires regenerating migrations.
