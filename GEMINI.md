# GEMINI.MD: AI Collaboration Guide

This document provides essential context for AI models interacting with this project. Adhering to these guidelines will ensure consistency and maintain code quality.

## 1. Project Overview & Purpose

* **Primary Goal:** Action Amplifier is a local-first, text-based personal productivity system. It organizes tasks, projects, and resources using a structured file layout (TOML, Markdown, and folders) to enable "Action Amplifier" features.
* **Business Domain:** Personal Productivity, Task Management, Knowledge Management (PKM).

## 2. Core Technologies & Stack

* **Languages:** [Inferred] Likely Python, Rust, or Go for the CLI/Backend tool (Action Amplifier) to parse these files. Currently, only documentation exists.
* **Frameworks & Runtimes:** [Inferred] TBD.
* **Databases:** The filesystem is the database. Data is stored in TOML (`actions.toml`, `area.toml`) and plain text files.
* **Key Libraries/Dependencies:** [Inferred] TOML parsers, file system watchers.
* **Package Manager(s):** [Inferred] TBD.

## 3. Architectural Patterns

* **Overall Architecture:** Local-first, file-centric architecture. The "database" is a directory tree (`data/`) containing structured text files. This allows for version control (Git), human readability, and tool interoperability.
* **Directory Structure Philosophy:**
    * `docs/`: Documentation and specifications.
    * `data/`: (Proposed) The root for all user data (Inbox, Areas, Reviews).
    * `config/`: (Proposed) Configuration files.

## 4. Coding Conventions & Style Guide

* **Formatting:**
    * **TOML:** Used for structured data (actions, projects, areas).
    * **Markdown:** Used for documentation and potentially notes.
    * **Dates:** ISO 8601 (`YYYY-MM-DDTHH:MM:SS`).
    * **Naming:** Kebab-case for files and directories (e.g., `website-redesign`, `actions.toml`). No spaces.
* **Naming Conventions:**
    * Projects: Lowercase, hyphen-separated.
    * Areas: Lowercase, single word preferred.
* **API Design:** N/A (File-based API).
* **Error Handling:** [Inferred] Tools should handle missing files or malformed TOML gracefully.

## 5. Key Files & Entrypoints

* **Main Entrypoint(s):** N/A (Documentation only phase).
* **Configuration:** `docs/file-layout-specification.md` serves as the current source of truth for the data structure.

## 6. Development & Testing Workflow

* **Local Development Environment:** TBD.
* **Testing:** TBD.
* **CI/CD Process:** TBD.

## 7. Specific Instructions for AI Collaboration

* **Contribution Guidelines:** Follow the `docs/file-layout-specification.md` strictly when proposing file structure changes or generating sample data.
* **Infrastructure (IaC):** N/A.

## 8. Available Tools

* **Browser Tools:** See `browser-tools/README.md` for a suite of Chrome DevTools Protocol scripts available in the path (e.g., `browser-start.js`, `browser-nav.js`) for agent-assisted web automation.
