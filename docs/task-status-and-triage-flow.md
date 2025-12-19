# Task Statuses and Triage Flow

## Overview

Action Amplifier uses a status-based task management system with a triage workflow to ensure tasks are properly categorized before they enter active work.

## Task Statuses

### Draft State
- **Status**: `draft`
- **Description**: Newly created items that have not been triaged yet
- **Behavior**: 
  - Appears only in the Inbox and Triage views
  - Does not appear in Dashboard or active task views
  - Cannot be assigned to projects or areas until triaged
- **Default Status**: All newly created tasks and notes start in `draft` status

### Active Work States
- **Status**: `todo`
- **Description**: Tasks that have been triaged and are ready to work on
- **Behavior**: 
  - Appears in Dashboard, Project views, and search results
  - Can be assigned to projects and areas
  - Ready for scheduling and execution

- **Status**: `in_progress`
- **Description**: Tasks currently being worked on
- **Behavior**: 
  - Shows as active work in progress
  - May have time tracking and progress indicators

### Completion States
- **Status**: `completed`
- **Description**: Tasks that are finished and done
- **Behavior**: 
  - Marked as complete with completion date
  - Appears in completed views and reports

- **Status**: `cancelled`
- **Description**: Tasks that are no longer needed or relevant
- **Behavior**: 
  - Removed from active work but kept for record

### Blocker States
- **Status**: `blocked`
- **Description**: Tasks that cannot proceed due to dependencies or issues
- **Behavior**: 
  - Requires intervention before work can continue
  - Should include blocking reason

## Triage Flow

### Step 1: Capture
- Items are captured via the `/capture` page
- All items start in `draft` status automatically
- Items can be of type: action, note, link, idea, resource

### Step 2: Triage
- Navigate to `/triage` to review draft items
- For each draft item, choose one of:
  - **Triaged as Todo**: Moves from `draft` → `todo` status
  - **Move to Project**: Assigns to specific project (becomes `todo`)
  - **Archive**: Removes from active consideration
  - **Delete**: Permanently removes the item

### Step 3: Active Work
- Only `todo` items and beyond appear in active work views
- Tasks can be prioritized, scheduled, and executed
- Status transitions follow normal workflow

## Implementation Details

### Status Transitions
```
draft → todo (triage process)
todo → in_progress (start work)
in_progress → completed (finish work)
in_progress → blocked (encounter issues)
blocked → in_progress (resolve issues)
todo/in_progress/blocked → cancelled (cancel work)
```

### Default Behavior
- **New Items**: Automatically assigned `draft` status
- **Bulk Move**: Creates items in `draft` status
- **Fallback**: Uses `draft` as default when status is undefined

### UI Indicators
- **Draft**: Orange badge (`bg-orange-500/10 text-orange-500`)
- **Todo**: Gray badge (`bg-gray-500/10 text-gray-500`)
- **In Progress**: Blue badge (`bg-blue-500/10 text-blue-500`)
- **Completed**: Green badge (`bg-green-500/10 text-green-500`)
- **Blocked**: Red badge (`bg-red-500/10 text-red-500`)
- **Cancelled**: Gray badge (`bg-gray-500/10 text-gray-500`)

## API Integration

### Status Validation
The system validates status values using TypeScript types and Zod schemas to ensure only valid statuses are used throughout the application.

### Content Collections
Status is stored in the frontmatter of markdown files and validated through Astro content collections configuration.

## Benefits

1. **Clear Workflow**: Distinction between captured items and actionable tasks
2. **Reduced Noise**: Draft items don't clutter active work views
3. **Intentional Processing**: Forces review before items enter workflow
4. **Flexibility**: Can defer decisions about items without losing them
5. **Better Organization**: Clean separation between inbox and task management