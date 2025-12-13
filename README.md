# Action Amplifier (ActionAmp)

An Astro.js-based productivity application designed to help you focus on the most important and valuable tasks.

## Overview

Action Amplifier helps you organize your thinking about work and actions, following GTD (Getting Things Done) principles.

## Key Features

- **Inbox**: A flexible text input where you can capture anything - URLs, notes, ideas, tasks
- **Item Types**: Inbox items can be Actions, Resources, or Notes
- **Triage System**: Process inbox items and assign them to appropriate destinations
- **Quick Actions**: Complete simple tasks immediately during triage
- **Areas/Contexts**: Organize work into life areas (e.g., Home, Work, Personal)
- **Projects**: Group related actions and resources within areas for focused execution
- **Next Action**: Context-aware view that automatically presents the most important next action
- **Reviews**: Daily, weekly, monthly, or quarterly reviews that collect completed items and use customizable templates
- **Archiving**: Projects, contexts, actions, and resources can be archived when no longer active
- **Text-Based Storage**: All data stored in text files for portability and simplicity

## Workflow

1. **Capture**: Add items to the Inbox
2. **Triage**: Process each item - classify as Action, Resource, or Note, then complete immediately or assign to a project
3. **Organize**: Projects belong to Areas (Home, Work, Personal, etc.) and contain both actions and resources
4. **Execute**: View Next Action - the system determines which action from which project to work on based on your current context
5. **Review**: Create periodic reviews (daily/weekly/monthly/quarterly) that automatically gather completed items and provide space for reflection

## Core Principles

- Focus on what matters most
- GTD methodology
- Text file-based data storage
- Simple, friction-free capture and processing

## Development

### Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Open http://localhost:4000 in your browser

### Development Workflow

When working on this project, follow these rules:

1. **Task Management**: Use `bd` (beads) to pick tasks, work on **only one task at a time**
2. **Git Cleanliness**: Do not start new tasks when there are untracked files in git
3. **Pre-commit Testing**: Run tests before committing and resolve any failures
4. **Task Process**:
   - Pick highest priority ready task from `bd ready`
   - Mark as `in_progress` when starting: `bd update <task-id> --status in_progress`
   - Complete the task implementation
   - **CRITICAL**: Run the full test suite (`npm test` and `npm run test:e2e` when available)
   - Verify all tests pass before proceeding
   - Commit changes if tests pass
   - Close task when complete: `bd close <task-id>`
   - **IMPORTANT**: Tasks cannot be marked complete until ALL tests are passing
5. **Separate Commits**: Keep different types of changes in separate commits

### Testing

- Unit tests: `npm test` (uses Vitest)
- E2E tests: `npm run test:e2e` (uses Playwright)
- Always run tests before committing changes

### Using Beads for Task Management

Beads is a dependency-aware issue tracker that helps manage development tasks.

#### Installation

Beads data is already initialized in this project in the `.beads/` directory.

#### Common Commands

```bash
# View ready tasks (no blockers)
bd ready

# Show task details
bd show <task-id>

# Create a new task
bd create "Task description" -p 1 -t feature

# Update task status
bd update <task-id> --status in_progress
bd update <task-id> --priority 0

# Add dependencies between tasks
bd dep add <task-id> <blocks-task-id>

# Close a task
bd close <task-id>

# List all tasks
bd list
bd list --status open
bd list --priority 0
```

#### Priority Levels

- P0: Highest priority
- P1: High priority
- P2: Medium priority
- P3: Low priority
- P4: Lowest priority

#### Task Dependencies

Beads supports dependency tracking:
- `blocks`: Task B must complete before task A
- `related`: Soft connection between tasks
- `parent-child`: Epic/subtask relationship

#### Git Integration

Beads automatically syncs with git:
- Tasks are exported to JSONL files
- Changes are imported after git pull
- No manual sync needed

### Project Structure

```
action-amp/
├── src/                 # Source code
│   ├── components/      # Astro components
│   ├── lib/            # Library code
│   └── styles/         # CSS/styles
├── public/             # Static assets
├── data/               # User data (gitignored)
├── .beads/            # Beads task data
│   ├── issues.jsonl   # Exported issues (tracked)
│   ├── metadata.json  # Beads config (tracked)
│   └── *.db           # SQLite database (ignored)
└── astro.config.mjs   # Astro configuration
```
