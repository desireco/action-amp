# Action Amplifier File Layout Specification

This document defines the text-based file structure and formats that enable all Action Amplifier features.

## Directory Structure

```
data/
├── inbox/                    # Unprocessed items
│   ├── dentist-x9k2.md       # Individual action file
│   ├── tips-p4q5.md
│   ├── standup-m2n3.md
│   ├── meeting-screenshot.png
│   └── voice-memo.m4a
├── areas/                    # Life areas/contexts
│   ├── home/
│   │   ├── renovation/               # Project folder
│   │   │   ├── act-competitor-b5v6.md # Action file
│   │   │   ├── act-wireframes-x8z9.md
│   │   │   ├── budget.xlsx
│   │   │   ├── contractor-quotes.pdf
│   │   │   ├── before-photos/
│   │   │   │   ├── kitchen-before.jpg
│   │   │   │   └── bathroom-before.jpg
│   │   │   ├── permits.pdf
│   │   │   └── timeline.gantt
│   │   ├── garden-project/           # Another project folder
│   │   │   ├── act-plant-list-j8k9.md
│   │   │   ├── soil-test-results.pdf
│   │   │   └── garden-design.sketch
│   │   ├── archived/
│   │   │   ├── project-name.toml
│   │   │   └── project-name-resources.txt
│   │   └── area.toml
│   ├── work/
│   │   ├── website-redesign/         # Project folder
│   │   │   ├── act-design-q2w3.md
│   │   │   ├── act-brand-r4t5.md
│   │   │   ├── wireframes.fig
│   │   │   ├── brand-guidelines.pdf
│   │   │   ├── research/
│   │   │   │   ├── competitor-analysis.xlsx
│   │   │   └── mockups/
│   │   │       ├── homepage-v1.png
│   │   ├── archived/
│   │   │   ├── project-name.toml
│   │   │   └── project-name-resources.txt
│   │   └── area.toml
│   └── personal/
│       ├── fitness-goals/            # Project folder
│       │   ├── workout-plan.pdf
│       │   ├── gym-membership.pdf
│       │   └── meal-prep-recipes.txt
│       ├── vacation-planning/
│       │   ├── flight-confirmations.pdf
│       │   └── itinerary.docx
│       ├── archived/
│       │   ├── project-name.toml
│       │   └── project-name-resources.txt
│       └── area.toml
├── reviews/                  # Periodic reviews
│   ├── daily/
│   ├── weekly/
│   ├── monthly/
│   └── quarterly/
├── templates/                # Review templates
│   ├── daily.txt
│   ├── weekly.txt
│   ├── monthly.txt
│   └── quarterly.txt
└── config/
    ├── settings.txt
    └── next-action-rules.txt
```

## File Formats

### Inbox Item (`inbox/[id].md`)
```markdown
---
id: "dentist-x9k2"
type: "action"
title: "Call dentist for appointment"
captured: 2024-01-15T10:30:00
---
Dr. Smith, 555-0123. Ask for morning slot.
```

```markdown
---
id: "tips-p4q5"
type: "resource"
title: "Productivity Tips Article"
captured: 2024-01-15T11:15:00
---
https://example.com/productivity-tips
```

Inbox folder contains captured items as individual markdown files.

### Area Definition (`areas/[area]/area.toml`)
```toml
[area]
name = "Work"
description = "Professional responsibilities and career development"
priority = "high"
active = true
created = "2024-01-01T00:00:00"
```

### Project Definition (`areas/[area]/[project-name]/project.toml`)
```toml
[project]
name = "Website Redesign"
area = "work"
status = "active"
priority = "high"
created = "2024-01-10T00:00:00"
due_date = "2024-03-15T00:00:00"
description = "Complete redesign of company website"
```

### Project Action (`areas/[area]/[project-name]/act-[id].md`)
```markdown
---
id: "competitor-b5v6"
title: "Research competitor websites"
status: "todo"
priority: "medium"
created: 2024-01-10T00:00:00
---
Focus on navigation and color schemes.
```

```markdown
---
id: "wireframes-x8z9"
title: "Create wireframes"
status: "todo"
priority: "high"
created: 2024-01-10T00:00:00
---
Use Figma. Need 3 variations.
```

```markdown
---
id: "design-q2w3"
title: "Meet with design team"
status: "completed"
completed: 2024-01-12T14:00:00
created: 2024-01-10T00:00:00
---
Discuss initial concepts.
```

### Project Resources (Multiple files in `areas/[area]/[project-name]/`)
Each project folder can contain any number of resource files:
- `wireframes.fig` - Design files
- `brand-guidelines.pdf` - Reference documents
- `research/` - Subfolder for research materials
- `meeting-notes.txt` - Text-based notes
- `budget.xlsx` - Spreadsheets
- `assets/` - Images, logos, etc.

### Archived Projects (`areas/[area]/archived/[project-name].toml`)
Same format as active projects, but with:
```toml
[project]
status = "archived"
archived_date = "2024-01-20T00:00:00"
archived_reason = "completed"
```

### Review Files (`reviews/[type]/YYYY-MM-DD.txt`)
```
# Daily Review - 2024-01-15

## Completed Today
- [x] Call dentist for appointment (from: work/health-maintenance/act-dentist-x9k2.md)
- [x] Review quarterly budget (from: work/q1-planning/act-budget-h7j8.md)

## Reflection
What went well: Focused morning work session
What was difficult: Too many interruptions in afternoon
Energy level: 7/10

## Tomorrow's Focus
- Complete wireframes for website redesign
- Follow up on budget approval

## Template Sections
[Include sections from templates/daily.txt]
```

### Review Templates (`templates/[type].txt`)
```
# Daily Review Template

## Completed Today
[Auto-populated with completed actions]

## Reflection
What went well:
What was difficult:
Energy level: /10

## Tomorrow's Focus
-
-
-
```

### Settings (`config/settings.txt`)
```
# Action Amplifier Settings
default_area: work
review_time_daily: 17:00
review_time_weekly: friday_17:00
next_action_context: work
archive_completed_after_days: 30
inbox_auto_triage: false
```

### Next Action Rules (`config/next-action-rules.txt`)
```
# Next Action Selection Rules
# Format: condition -> weight

area:work AND time:weekday -> 1.0
area:personal AND time:weekend -> 1.0
priority:high -> 2.0
due_date:within_3_days -> 3.0
project:active -> 1.5
project:archived -> 0.0
```

## Item Status Conventions

### Action States
- `todo` - Not started
- `completed` - Completed
- `in_progress` - In progress
- `blocked` - Blocked/waiting
- `cancelled` - Cancelled

### Priority Levels
- `high` - Must do
- `medium` - Should do
- `low` - Nice to do

### Timestamps
All timestamps use ISO 8601 format: `YYYY-MM-DDTHH:MM:SS`

## File Naming Conventions

- **Inbox items:** `[keyword]-[suffix].md` (e.g., `dentist-x9k2.md`) - No prefix as type is undecided.
- **Processed Actions:** `act-[keyword]-[suffix].md` (e.g., `act-meeting-x74y.md`)
- Project files: lowercase, hyphen-separated (e.g., `website-redesign.txt`)
- Review files: `YYYY-MM-DD.txt` format
- Area directories: lowercase, single word preferred
- No spaces in filenames or directory names

## Data Integrity Rules

1. Each action belongs to exactly one project
2. Each project belongs to exactly one area
3. **IDs must be unique across the entire system.** IDs are hybrid strings: a relevant keyword from the title followed by a random 4-character alphanumeric suffix (e.g., "meeting-x74y").
4. **Context by Location:** An action's location (Inbox vs Project folder) determines its context. Moving the file changes its association.
5. Completed items retain completion timestamp
6. Archived items maintain full history
7. Reviews reference original source files
8. All text files use UTF-8 encoding

## Web Application Source Layout

This section defines the directory structure for the web application interface (using Astro) and its integration with the data layer.

### Project Root Structure

```
.
├── data/                     # User data (Inbox, Areas, Reviews) - The "Database"
│   ├── inbox/
│   │   ├── [id].md           # Actions as markdown files
│   │   └── ...
│   ├── areas/
│   └── ...
├── src/
│   ├── content/
│   │   └── config.ts         # Content Collections definition (Zod schemas)
│   ├── components/           # Reusable UI components
│   ├── layouts/              # Page layouts
│   ├── lib/
│   │   └── data/             # Data Access Layer (DAL) - For WRITES
│   │       ├── api.ts        # File system interactions (fs/promises)
│   │       ├── writer.ts     # Logic to update Frontmatter/Move files
│   │       └── types.ts      # Shared types (inferred from Zod schemas)
│   ├── pages/
│   │   ├── index.astro
│   │   ├── api/              # API Endpoints for data mutation
│   │   │   ├── actions.ts    # POST/PUT/DELETE actions
│   │   │   └── ...
│   │   └── app/              # Authenticated application routes
│   │       └── ...
│   └── ...
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

### Data Integration Strategy

1.  **Local-First Database:** The `data/` directory remains the source of truth.
2.  **Astro Content Collections (Read Layer):**
    *   Use **Content Collections** to read and validate data from `data/`.
    *   **Loaders:** Use a custom loader (Astro 5.0+ Content Layer API) or a configured path to ingest data from the `data/` directory into collections (`inbox`, `projects`, `areas`).
    *   **Schema Validation:** Use **Zod** in `src/content/config.ts` to strictly enforce the data shape (e.g., ensuring `id`, `title`, `status` fields are correct).
    *   **Type Safety:** Astro automatically generates TypeScript types for all queried data.
3.  **Data Access Layer (Write Layer):**
    *   Since Content Collections are read-optimized, use `src/lib/data/` for **mutations** (Create, Update, Delete).
    *   This layer directly modifies the Markdown files in `data/` using Node.js `fs` and a frontmatter parser (e.g., `gray-matter`).
    *   **Moving Items:** To move an item from Inbox to a Project, simply move the `.md` file to the corresponding project directory.
    *   After a write, the page reload (or server action) triggers a re-read via Content Collections.
4.  **API Routes:** Used to handle client-side requests for updates (e.g., checking off a task), which then delegate to the Write Layer.

## Implementation Notes

- Files are human-readable and editable
- **Markdown Frontmatter** used for metadata
- Git-friendly for version control
- Cross-platform compatibility
- No binary dependencies
- Backup-friendly structure