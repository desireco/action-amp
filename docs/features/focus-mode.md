---
slug: focus-mode
title: "Focus mode (single-task overlay)"
feature_area: focus
status: partial
spec: —
verified: 2026-07-03
---

# Focus mode

**What.** Full-screen single-task view (`components/ui/FocusMode.tsx`). Entered
from Next's "Do this" (which also starts the task as "Now"). Actions: Done,
Exit. Esc exits. No sidebar, no counts.

**Partial — what's missing.**
- **No timer/pomodoro** anywhere in the codebase (FEATURES.md F14 is Phase 2).
- **Start/Pause live on the Next card** (`NextPage.handleStart/handlePause` via
  `startTask`/`pauseTask`), not inside FocusMode itself.

**Files.** `components/ui/FocusMode.tsx`; start/pause in `app/NextPage.tsx`.

**Done?** Partial. The overlay exists and works; the timer is explicitly Phase 2.
