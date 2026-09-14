# Reading the live CLI reference

Do not hardcode command documentation. The authoritative reference is printed
by the CLI itself and is version-matched to the binary the user has installed:

```sh
actionamp llm
```

Run it once at the start of a session that will do more than one action. It
lists every command, its `--json` shape, task field semantics, and workflow
patterns.

## Quick orientation when you can't run it yet

- Read state: `now`, `today [--done]`, `task show`, `inbox list`,
  `lens list`, `project list/show`, `goal list/show`, `logbook`,
  `review week|month`, `whoami`.
- Act: `task done|start|pause|snooze|move`, `capture`, `inbox triage`,
  `project create|add-task`, `resource add|update|delete`, `goal create`,
  `skills install`.
- Capture parses natural language: `#project`, `@date`, `!priority`,
  `#tags`, `[[lens]]`.

If `actionamp llm` fails with 401, see the login recovery rules in
[rules.md](rules.md).
