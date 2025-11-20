# Action Amplifier File Layout Specification

This document defines the text-based file structure and formats that enable all Action Amplifier features.

## Directory Structure

```
data/
├── inbox/                    # Unprocessed items
│   ├── actions.toml
│   ├── meeting-screenshot.png
│   ├── article-bookmark.url
│   └── voice-memo.m4a
├── areas/                    # Life areas/contexts
│   ├── home/
│   │   ├── renovation/               # Project folder
│   │   │   ├── actions.toml
│   │   │   ├── budget.xlsx
│   │   │   ├── contractor-quotes.pdf
│   │   │   ├── before-photos/
│   │   │   │   ├── kitchen-before.jpg
│   │   │   │   └── bathroom-before.jpg
│   │   │   ├── permits.pdf
│   │   │   └── timeline.gantt
│   │   ├── garden-project/           # Another project folder
│   │   │   ├── actions.toml
│   │   │   ├── plant-list.txt
│   │   │   ├── garden-design.sketch
│   │   │   └── soil-test-results.pdf
│   │   ├── archived/
│   │   │   ├── project-name.toml
│   │   │   └── project-name-resources.txt
│   │   └── area.toml
│   ├── work/
│   │   ├── website-redesign/         # Project folder
│   │   │   ├── actions.toml
│   │   │   ├── wireframes.fig
│   │   │   ├── brand-guidelines.pdf
│   │   │   ├── user-personas.docx
│   │   │   ├── research/
│   │   │   │   ├── competitor-analysis.xlsx
│   │   │   │   ├── user-interviews.mp4
│   │   │   │   └── analytics-report.pdf
│   │   │   └── mockups/
│   │   │       ├── homepage-v1.png
│   │   │       └── mobile-layout.png
│   │   ├── archived/
│   │   │   ├── project-name.toml
│   │   │   └── project-name-resources.txt
│   │   └── area.toml
│   └── personal/
│       ├── fitness-goals/            # Project folder
│       │   ├── actions.toml
│       │   ├── workout-plan.pdf
│       │   ├── progress-photos/
│       │   │   ├── week1.jpg
│       │   │   └── week4.jpg
│       │   ├── meal-prep-recipes.txt
│       │   └── gym-membership.pdf
│       ├── vacation-planning/
│       │   ├── actions.toml
│       │   ├── flight-confirmations.pdf
│       │   ├── hotel-bookings.pdf
│       │   ├── itinerary.docx
│       │   └── travel-photos/
│       │       └── destination-inspiration.jpg
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

### Inbox (`inbox/actions.toml`)
```toml
# Inbox items awaiting triage

[[items]]
id = "dentist-x9k2"
type = "action"
title = "Call dentist for appointment"
description = "Dr. Smith, 555-0123. Ask for morning slot."
captured = "2024-01-15T10:30:00"

[[items]]
id = "tips-p4q5"
type = "resource"
title = "Productivity Tips Article"
description = "https://example.com/productivity-tips"
captured = "2024-01-15T11:15:00"

[[items]]
id = "standup-m2n3"
type = "note"
title = "Standup Notes"
description = "Meeting notes from standup:\n- J. working on API\n- K. on frontend"
captured = "2024-01-15T14:20:00"

[[items]]
id = "budget-h7j8"
type = "action"
title = "Review quarterly budget"
description = ""
captured = "2024-01-15T16:45:00"
```

Inbox folder contains captured items awaiting triage:
- `meeting-screenshot.png` - Screenshot from video call
- `article-bookmark.url` - Saved web link
- `voice-memo.m4a` - Quick voice note
- `notes/` - Subfolder for related materials

### Area Definition (`areas/[area]/area.toml`)
```toml
[area]
name = "Work"
description = "Professional responsibilities and career development"
priority = "high"
active = true
created = "2024-01-01T00:00:00"
```

### Project Actions (`areas/[area]/[project-name]/actions.toml`)
```toml
[project]
name = "Website Redesign"
area = "work"
status = "active"
priority = "high"
created = "2024-01-10T00:00:00"
due_date = "2024-03-15T00:00:00"
description = "Complete redesign of company website"

[[items]]
id = "competitor-b5v6"
title = "Research competitor websites"
description = "Focus on navigation and color schemes."
status = "todo"
priority = "medium"
created = "2024-01-10T00:00:00"

[[items]]
id = "wireframes-x8z9"
title = "Create wireframes"
description = "Use Figma. Need 3 variations."
status = "todo"
priority = "high"
created = "2024-01-10T00:00:00"

[[items]]
id = "design-q2w3"
title = "Meet with design team"
description = "Discuss initial concepts."
status = "completed"
completed = "2024-01-12T14:00:00"
created = "2024-01-10T00:00:00"

[[items]]
id = "brand-r4t5"
title = "Review brand guidelines"
description = ""
status = "todo"
priority = "medium"
created = "2024-01-10T00:00:00"

[[items]]
id = "content-u7i8"
title = "Draft content strategy"
description = "Coordinate with marketing."
status = "todo"
priority = "low"
created = "2024-01-10T00:00:00"

[notes]
content = """
Design team prefers minimalist approach
Budget approved for external consultant if needed
Launch target is Q1 end
"""
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
- [x] Call dentist for appointment (from: work/health-maintenance/actions.toml)
- [x] Review quarterly budget (from: work/q1-planning/actions.toml)

## Reflection
What went well: Focused morning work session
What could improve: Too many interruptions in afternoon
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
What could improve:
Energy level: /10

## Tomorrow's Focus
-
-
-

## Gratitude
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

- Project files: lowercase, hyphen-separated (e.g., `website-redesign.txt`)
- Review files: `YYYY-MM-DD.txt` format
- Area directories: lowercase, single word preferred
- No spaces in filenames or directory names

## Data Integrity Rules

1. Each action belongs to exactly one project
2. Each project belongs to exactly one area
3. **IDs must be unique across the entire system.** IDs are hybrid strings: a relevant keyword from the title followed by a random 4-character alphanumeric suffix (e.g., "meeting-x74y").
4. Completed items retain completion timestamp
5. Archived items maintain full history
6. Reviews reference original source files
7. All text files use UTF-8 encoding

## Implementation Notes

- Files are human-readable and editable
- Simple parsing with regex patterns
- Git-friendly for version control
- Cross-platform compatibility
- No binary dependencies
- Backup-friendly structure