# Feature Outline: Triage Mode

## Overview
Implement a "Triage" mode that allows users to rapidly process Inbox items one by one. The workflow focuses on clearing the inbox by either editing/refining the item, moving it to a project, or deleting it, then automatically advancing to the next item.

## Components

### 1. Data Layer (`src/lib/data/writer.ts`)
*   **`updateInboxItem(id, updates)`**: Method to update an inbox item's title, content, and type.
*   **`deleteInboxItem(id)`**: Method to delete an inbox item from the filesystem.

### 2. API Endpoints
*   **`src/pages/api/inbox/[id].ts`**:
    *   `PUT`: Handles updates to inbox items.
    *   `DELETE`: Handles deletion of inbox items.

### 3. Navigation
*   **`src/layouts/AppLayout.astro`**: Add "Triage" to the sidebar navigation.

### 4. Triage Index Page (`src/pages/triage/index.astro`)
*   **Logic**:
    *   Fetch all inbox items.
    *   Sort items (Oldest First to encourage clearing backlog).
    *   Redirect to `/triage/[first_item_id]`.
    *   If inbox is empty, display an "Inbox Zero" celebration screen.

### 5. Triage Item Page (`src/pages/triage/[id].astro`)
*   **Layout**:
    *   **Header**: "Triage Mode" indicator and progress (e.g., "Item 1 of 5").
    *   **Main Content**: Two-column layout (on desktop).
        *   **Left (Edit)**: Form to edit Title, Content (Body), and Type.
        *   **Right (Process)**: Actions to dispose of the item.
*   **Actions**:
    *   **Save & Next**: Updates the item (PUT) and navigates to the next item.
    *   **Move to Project**: Assigns item to a project (POST `/api/actions/move`) and navigates to the next item.
    *   **Delete**: Deletes the item (DELETE) and navigates to the next item.
    *   **Skip**: Navigates to the next item without changes.

## Workflow
1.  User clicks "Triage" in nav.
2.  User is redirected to the first inbox item.
3.  User edits the item (e.g., clarifies title) and clicks "Save & Next".
4.  System updates item and loads the next one.
5.  User decides an item belongs to "Website Redesign" project.
6.  User selects project and clicks "Move".
7.  System moves file and loads the next one.
8.  When all items are processed, user sees "Inbox Zero".
