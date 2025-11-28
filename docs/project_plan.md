# Action Amplifier Implementation Plan

This document outlines the roadmap for building the Action Amplifier application based on the [File Layout Specification](./file-layout-specification.md).

## Progress
**Current Status:** Phase 3 Complete. Ready to start Phase 4.

| Phase | Status | Description |
| :--- | :--- | :--- |
| **Phase 1: Foundation & Data Layer** | ✅ Completed | Project setup, Data structure, Content Collections. |
| **Phase 1.5: Testing Infrastructure** | ✅ Completed | Vitest & Playwright setup. |
| **Phase 2: Core UI & Read Views** | ✅ Completed | Layout, Inbox View, Areas & Projects View. |
| **Phase 3: Write Operations** | ✅ Completed | Data Access Layer, API, Interactive UI. |
| **Phase 4: Advanced Features** | ⏳ Next | Next Action Logic, Reviews, Search. |

## Phase 1: Foundation & Data Layer
**Goal:** Initialize the project and establish the file-based data structure.

1.  **Project Setup**
    *   [x] Initialize a new Astro project (v5.0+ recommended for Content Layer API).
    *   [x] Configure Tailwind CSS (as per standard web app stack).
    *   [x] Set up project structure matching the specification (`data/` at root, `src/` for app).

2.  **Data Structure Initialization**
    *   [x] Create the `data/` directory hierarchy (`inbox`, `areas`, `reviews`, `templates`, `config`).
    *   [x] Create sample data for development (Inbox items, Areas, Projects).

3.  **Content Collections (Read Layer)**
    *   [x] Define Zod schemas in `src/content/config.ts` for:
        *   `inbox` (Markdown)
        *   `areas` (TOML)
        *   `projects` (TOML)
        *   `actions` (Markdown)
    *   [x] Configure loaders to read from the `data/` directory.

## Phase 1.5: Testing Infrastructure
**Goal:** Establish a robust testing environment before building UI and logic.

1.  **Unit Testing (Vitest)**
    *   [x] Install and configure Vitest.
    *   [x] Create initial unit tests for data schemas and utilities.

2.  **E2E Testing (Playwright)**
    *   [x] Install and configure Playwright.
    *   [x] Create a basic E2E test to verify the home page loads.

## Phase 2: Core UI & Read Views
**Goal:** Visualize the data in the application.

1.  **Public Pages**
    *   [x] Create E2E tests for Landing and FAQ pages.
    *   [x] Implement Landing Page (`index.astro`) and FAQ Page (`faq.astro`).

2.  **Layout & Design System**
    *   [x] Create a responsive application layout (Sidebar navigation, Main content area).
    *   [x] Implement basic design tokens (colors, typography).

3.  **Inbox View**
    *   [x] Display a list of all items in `data/inbox/`.
    *   [x] Show details for selected items.

4.  **Areas & Projects View**
    *   [x] Tree view or dashboard for Areas (Home, Work, etc.).
    *   [x] Project detail pages listing their Actions and Resources.

## Phase 3: Write Operations (The "Amplifier")
**Goal:** Enable data manipulation (Capture, Triage, Organize).

1.  **Data Access Layer (DAL)**
    *   [x] Implement `src/lib/data/api.ts` for file system operations.
    *   [x] Implement `src/lib/data/writer.ts` for frontmatter updates and file moves.

2.  **API Endpoints**
    *   [x] Create Astro API routes (`src/pages/api/`) to handle:
        *   [x] Creating new Inbox items.
        *   [x] Updating item status (e.g., completing a task).
        *   [x] Moving items (e.g., Inbox -> Project).

3.  **Interactive UI**
    *   [x] "Quick Capture" input form.
    *   [x] "Triage" interface for processing Inbox items ([Feature Outline](./triage_feature_outline.md)).
    *   [x] Task completion toggles.

## Phase 4: Advanced Features & Logic
**Goal:** Implement the "Smart" features of Action Amplifier.

1.  **Next Action Logic**
    *   [x] Implement the context-aware selection algorithm.
    *   [x] Create the "Next Action" dashboard view.
    *   [x] Context Selection Page & Sidebar Integration.

2.  **Review System**
    *   [ ] Implement daily/weekly review workflows.
    *   [ ] Auto-generate review files from templates.

3.  **Search & Filtering**
    *   [ ] Global search across all items.
    *   [ ] Filter by tag, context, or status.
