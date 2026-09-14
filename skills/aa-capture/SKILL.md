---
name: aa-capture
description: >
  Capture thoughts, links, reminders, and screenshots into ActionAmp from a
  conversation. Use when the user says "add ... to my todo/list", "remind me
  to ...", "save this for later", "I need to ...", shares a URL or image to
  file away, or mentions capture, inbox, or quick-adding anything.
---

# Capture

Zero-friction in, honest parsing out.

## Command

```sh
actionamp capture "<text>"                    # to inbox
actionamp capture "<text>" --source-url <url> # shared from the web
actionamp capture "<text>" --file <img> ...   # up to 4 images, 5 MB each
actionamp capture "<text>" --list-id <id>     # straight into a Simple list
```

## Natural-language cheatsheet

Capture parses markers out of plain text — use them instead of flags when the
user speaks casually:

```
#project      file into a project (e.g. "fix pagination #mvp")
@date         schedule ("@tomorrow", "@friday", "@9/20")
!priority     LOW | NORMAL | IMPORTANT ("!important")
#tags         free-form tags
[[lens]]      scope to a lens ("[[work]]")
```

## Workflow

1. Compose the text from what the user said — keep their words, add markers
   they implied but didn't type (e.g. they said "important" → `!important`).
2. Run the capture.
3. **Confirm the result back**: "Captured to inbox: `<text>`". If the parsed
   shape surprises (wrong project, unexpected date), say what was parsed so
   the user can correct it — never silently refile.

## Images

JPEG, PNG, GIF, WebP, HEIC/HEIF; max four per capture, 5 MB each. When the
user shares a screenshot with no words, ask one short question about what it
is, or capture with the filename as text and let triage handle it later.

## Rules

[../_shared/rules.md](../_shared/rules.md) — capture is safe to run, but
always report what was actually stored.
