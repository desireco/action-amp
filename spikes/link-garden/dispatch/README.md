# Link Garden spike — dispatch files

Self-contained task files you paste into the three coding agents. **The
target model is in the filename and the first line of every file** — no
guesswork at dispatch time.

| File | Target model | Role | When |
|---|---|---|---|
| `D1-api-codex.md` | **Codex** (capable) | author — backend | Day 1 AM |
| `D1-svelte-zai.md` | **Z.AI** (capable) | author — Svelte client | Day 1 PM |
| `D2-imba-gemini.md` | **Gemini** (capable) | author — Imba client | Day 2 AM |
| `D2-report-zai.md` | **Z.AI** (capable) | writes the comparison report | Day 2 PM |
| `REVIEW-TEMPLATE.md` | **different family than the author** | reviewer | after every landing |

Ferry order: **D1-api → review it → D1-svelte → review → D2-imba → review →
D2-report.** Reviews can also be handed to ZCode (Z.AI) in this workspace —
it is the standing reviewer/integrator and will run the checklist itself.

Every file instructs the agent to write findings into
`spikes/link-garden/notes/` — the report file consumes those notes, so don't
skip landing them.

Spec source of truth: `docs/plans/2026-08-31-spike-link-garden.md`.
Project home: `docs/plans/PLATFORM-SWITCH.md`.
