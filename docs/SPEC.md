# ActionAmp — Spec

> Status: DRAFT — work in progress
> Stack decision: **Wasp (wasp.sh)** — React + Node + Prisma. See `wasp-research.md`.

## 1. One-liner
An app that helps you focus on **action** — makes it easy to collect everything that needs to get done, but more importantly, focuses you on **what to do next**.

## 2. Problem
People with too much on their plate (incl. ADHD, trouble focusing) drown in lists of tasks. Capturing tasks is solved; deciding what to do *right now* is not. Long lists become anxiety, not action.

## 3. Target users
Anyone overwhelmed by too many things to do — especially ADHD / focus-challenged folks.

## 4. Goals / Non-goals

**Goals**
- Frictionless capture of anything that needs doing.
- A clear, calm answer to "what should I do next?" — not an overwhelming list.
- Multi-device (start with web app).

**Non-goals (for now)**
- Reusing code from `aa-old/` (ideas only).
- Native mobile (web app + API first).
- Team/shared lists (single-user to start).

## 5. Core features / MVP scope
- (TODO — to define: capture flow, the "focus" algorithm, item model, completion)

## 6. Out of scope (for now)
-

## 7. High-level architecture
- **Framework:** Wasp — spec-driven full-stack (`main.wasp.ts` + `schema.prisma` + `src/`).
- **Frontend:** React (Vite). **Backend:** Node.js. **DB:** Prisma (SQLite dev → PostgreSQL prod).
- **"API":** Wasp Operations (Queries read / Actions write), RPC + full-stack type safety. Custom HTTP endpoints only where needed.
- Details & rationale: `wasp-research.md`.

## 8. Open questions
- Starter template: `basic` vs `minimal` vs `saas` (OpenSaaS)?
- Auth method: username/password vs email vs social?
- What's the core "what next" logic? (manual rank? time/energy tagging? AI suggestion?)
