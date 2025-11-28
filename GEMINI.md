# GEMINI.MD: AI Collaboration Guide

This document provides essential context for AI models interacting with this project. Adhering to these guidelines will ensure consistency and maintain code quality.

## 1. Project Overview & Purpose

* **Primary Goal:** Action Amplifier is a local-first, text-based personal productivity system. It organizes tasks, projects, and resources using a structured file layout (TOML, Markdown, and folders) to enable "Action Amplifier" features. It provides a web interface to manage these files.
* **Business Domain:** Personal Productivity, Task Management, Knowledge Management (PKM).

## 2. Core Technologies & Stack

* **Languages:** TypeScript, JavaScript, HTML, CSS.
* **Frameworks & Runtimes:** Astro v5 (SSR with Node.js adapter), TailwindCSS v4.
* **Databases:** The filesystem is the database. Data is stored in TOML (`actions.toml`, `area.toml`, `project.toml`) and Markdown files within the `data/` directory.
* **Key Libraries/Dependencies:** 
    * `astro:content` (Content Collections) for data access.
    * `lucide-astro` for icons.
    * `zod` for schema validation.
    * `node:fs` for direct file manipulations where Content Collections are insufficient.
* **Package Manager(s):** npm.

## 3. Architectural Patterns

* **Overall Architecture:** Server-Side Rendered (SSR) Web Application. It runs locally and interacts directly with the filesystem.
* **Directory Structure Philosophy:**
    * `src/pages`: Astro pages and API routes.
    * `src/layouts`: Shared layouts (AppLayout).
    * `src/components`: Reusable UI components.
    * `src/content`: Content Collections configuration (`config.ts`).
    * `src/lib`: Utility functions, specifically `src/lib/data` for filesystem helpers.
    * `data/`: The root for all user data (Inbox, Areas, Reviews).
    * `docs/`: Documentation and specifications.

## 4. Coding Conventions & Style Guide

* **Formatting:**
    * **Indentation:** 4 spaces (inferred from existing code).
    * **Style:** Prettier is likely used.
* **Naming Conventions:**
    * **Files:** kebab-case (e.g., `project-card.astro`).
    * **Components:** PascalCase (e.g., `AppLayout.astro`).
    * **Variables/Functions:** camelCase.
* **API Design:** 
    * Internal API routes in `src/pages/api/` handle data mutations (POST/PUT/DELETE).
    * Data fetching is primarily done via `getCollection` and `getEntry` in Astro frontmatter.
* **Error Handling:** 
    * Try/catch blocks in API routes.
    * UI feedback via alerts (currently) or console errors.

## 5. Key Files & Entrypoints

* **Main Entrypoint(s):** `src/pages/index.astro` (Landing), `src/pages/dashboard.astro` (App Dashboard).
* **Configuration:** 
    * `astro.config.mjs`: Astro configuration.
    * `src/content/config.ts`: Data schema definitions.
    * `tailwind.config.mjs`: Tailwind configuration (if present, otherwise v4 uses CSS).
* **CI/CD Pipeline:** Playwright and Vitest are configured for testing.

## 6. Development & Testing Workflow

* **Local Development Environment:** `npm run dev` starts the Astro dev server.
* **Testing:** 
    * `npm test` runs Vitest (unit/integration).
    * `npm run test:e2e` runs Playwright (end-to-end).
* **CI/CD Process:** GitHub Actions (inferred).

## 7. Specific Instructions for AI Collaboration

* **Contribution Guidelines:** 
    * Follow the file layout specification in `docs/`.
    * Use `fsApi` from `src/lib/data/api.ts` for file operations when possible, or standard `node:fs`.
    * Ensure `data/` directory structure is respected.
* **Infrastructure (IaC):** N/A.

## 8. Available Tools

* **Browser Tools:** See `browser-tools/README.md` for a suite of Chrome DevTools Protocol scripts.
