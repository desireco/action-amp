---
name: wasp-add-feature
description: Add Wasp's batteries-included features to the app — authentication (email, Google, GitHub, Discord, Keycloak, Slack, etc.), email sending provider (SendGrid, Mailgun, etc.), database setup (PostgreSQL, SQLite), app branding / meta tags, and styling (Tailwind CSS, ShadCN UI). Use when the user wants to add, configure, or switch one of these full-stack Wasp features. Loads the relevant versioned Wasp docs and walks through the config changes. One feature per invocation.
---

# Add a Wasp Feature

Add Wasp's batteries-included features to the app. Each invocation focuses on **one** feature.

## Before Starting

1. Verify you're in the app directory (`webapp/`) — check for `webapp/main.wasp.ts` (or `main.wasp`).
2. Follow the **Documentation Protocol** from the `wasp` skill: run `wasp version`, fetch the matching `https://wasp.sh/llms-<VERSION>.txt` map, and pull the relevant raw-markdown guide URLs before editing. **Always base edits on the fetched docs**, not memory.

## Available Features

Present these to the user and let them choose **one** to configure:

| Feature | Description |
|---|---|
| **App Branding** | Set the app's name, description, and meta tags |
| **Authentication** | Add login methods (Email, Google, GitHub, Discord, Keycloak, Slack, etc.) |
| **Email Provider** | Configure email sending (SendGrid, Mailgun, etc.) |
| **Database** | Set up / switch database (PostgreSQL, SQLite) |
| **Styling (CSS, UI)** | Add Tailwind CSS or ShadCN UI (on top of Tailwind) |

Ask the user which feature they want (plain question — no special tool needed). Remind them they can also name something not on the list.

## Execute the Selected Feature

Follow the corresponding guide below. **Always fetch the raw-markdown Wasp docs for the feature first** and use them as the source of truth for the exact config syntax (it differs between Wasp Spec / TS Config / DSL).

- **App Branding** → [app-branding.md](./app-branding.md)
- **Authentication** → [authentication.md](./authentication.md)
- **Email Provider** → [email-provider.md](./email-provider.md)
- **Database** → [database.md](./database.md)
- **Styling (CSS, UI)** → [styling.md](./styling.md)

## When Asking the User to Choose from a List

(e.g. auth methods, email providers)

1. **Show the full list** before asking, so they know all options.
2. Highlight the 2–4 most popular as quick picks.
3. Remind them they can name any other option from the full list.

```
Available auth methods: Username & Password, Email, Google, GitHub, Discord, Keycloak, Slack

(Email / Google / GitHub are the most common — pick one, or name another from the list above.)
```

## After the Feature Is Configured

1. Summarize the changes made.
2. If there are **environment variables** to set, list them and offer guidance on where/how to set them (fetch the env-vars doc section if needed).
3. Ask if the user wants to configure **another feature** — if yes, return to the feature-selection step.
