# Queue

Duet work units are captured in docs/specs, docs/backlog, and docs/tasks.

- Build pulls highest-priority `ready` units.
- Discover pulls highest-priority `draft` units.
- Status changes happen via `node scripts/duet.mjs set-status`.
