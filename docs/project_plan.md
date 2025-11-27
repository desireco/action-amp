# Action Amplifier Implementation Plan

This document outlines the roadmap for building the Action Amplifier application based on the [File Layout Specification](./file-layout-specification.md).

## Phase 1: Foundation & Data Layer
**Goal:** Initialize the project and establish the file-based data structure.

1.  **Project Setup**
    *   Initialize a new Astro project (v5.0+ recommended for Content Layer API).
    *   Configure Tailwind CSS (as per standard web app stack).
    *   Set up project structure matching the specification (`data/` at root, `src/` for app).

2.  **Data Structure Initialization**
    *   Create the `data/` directory hierarchy (`inbox`, `areas`, `reviews`, `templates`, `config`).
    *   Create sample data for development (Inbox items, Areas, Projects).

3.  **Content Collections (Read Layer)**
    *   Define Zod schemas in `src/content/config.ts` for:
        *   `inbox` (Markdown)
        *   `areas` (TOML)
        *   `projects` (TOML)
        *   `actions` (Markdown)
    *   Configure loaders to read from the `data/` directory.

## Phase 2: Core UI & Read Views
**Goal:** Visualize the data in the application.

1.  **Layout & Design System**
    *   Create a responsive application layout (Sidebar navigation, Main content area).
    *   Implement basic design tokens (colors, typography).

2.  **Inbox View**
    *   Display a list of all items in `data/inbox/`.
    *   Show details for selected items.

3.  **Areas & Projects View**
    *   Tree view or dashboard for Areas (Home, Work, etc.).
    *   Project detail pages listing their Actions and Resources.

## Phase 3: Write Operations (The "Amplifier")
**Goal:** Enable data manipulation (Capture, Triage, Organize).

1.  **Data Access Layer (DAL)**
    *   Implement `src/lib/data/api.ts` for file system operations.
    *   Implement `src/lib/data/writer.ts` for frontmatter updates and file moves.

2.  **API Endpoints**
    *   Create Astro API routes (`src/pages/api/`) to handle:
        *   Creating new Inbox items.
        *   Updating item status (e.g., completing a task).
        *   Moving items (e.g., Inbox -> Project).

3.  **Interactive UI**
    *   "Quick Capture" input form.
    *   "Triage" interface for processing Inbox items.
    *   Task completion toggles.

## Phase 4: Advanced Features & Logic
**Goal:** Implement the "Smart" features of Action Amplifier.

1.  **Next Action Logic**
    *   Implement the context-aware selection algorithm.
    *   Create the "Next Action" dashboard view.

2.  **Review System**
    *   Implement daily/weekly review workflows.
    *   Auto-generate review files from templates.

3.  **Search & Filtering**
    *   Global search across all items.
    *   Filter by tag, context, or status.
