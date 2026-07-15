# Styling (CSS, UI) Setup

Configure a CSS framework and/or component library for the Wasp app.

## Prerequisites

- Fetch the list of CSS frameworks / styling options from the versioned Wasp docs (Project Setup / Customization sections, plus the Libraries guides).
- External library guides live under `https://github.com/wasp-lang/wasp/tree/release/web/docs/guides/libraries` — fetch specific guides via `raw.githubusercontent.com`.

## Steps

1. **Display the available options** (e.g. Pure Tailwind CSS, ShadCN UI on top of Tailwind, Radix Themes, etc.).
2. Ask the user which they'd like to use.
3. If they want a CSS framework → follow [Adding a CSS Framework](#adding-a-css-framework).
4. If they want ShadCN UI → follow [Adding ShadCN UI](#adding-shadcn-ui).
5. Restart the Wasp app if it's running (`wasp start`).

### Adding a CSS Framework

1. Fetch the raw-markdown guide for that framework's setup from the Wasp docs.
2. Follow the installation steps in the guide.

### Adding ShadCN UI

1. First set up Tailwind CSS per [Adding a CSS Framework](#adding-a-css-framework).
2. Fetch the raw-markdown guide for using ShadCN components with Wasp.
3. Follow the installation steps in the guide.

> **This repo note:** `webapp/package.json` already includes `tailwindcss` and `@tailwindcss/vite` (Tailwind v4). Confirm the installed version before adding config — Tailwind v4 uses a different setup (CSS-first `@import "tailwindcss"`) than v3.
