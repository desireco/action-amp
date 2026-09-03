# Launch list — what stands between here and the switch

> The complete pre-launch → launch-day → post-launch sequence with status.
> Companion docs: CHECKLIST.md (the runbook itself), ROLLBACK.md,
> ANNOUNCEMENT.md, visual-drift.md (the visual punch list),
> deferred.md (everything consciously skipped).
> Updated 2026-09-03.

## 1. Pre-launch — done

- [x] All 18 slices at parity, each cross-reviewed (S1–S18)
- [x] V1 parity run: full suite twice-green on the restored production dump
- [x] Auth continuity: existing sessions + PATs validate, new sessions issue in
      Wasp format (nobody re-logs-in on switch day)
- [x] AppShell ported (sidebar, lens switch, nav, footer, chords, Capture ⌘K)
- [x] Storybook + consolidated ui/ design system; token gate in lint
- [x] V3 switch kit: CHECKLIST / ROLLBACK / ANNOUNCEMENT / warm-check /
      verify-switch / rollback scripts
- [x] Single-service production image (Dockerfile) built + container-verified
- [x] Deployment reality check: production Railway env carries every credential
      the new stack needs (Resend, Stripe full set, VAPID trio, DATABASE_URL)
- [x] **Emails verified through the production Resend path** (2026-09-03):
      magic-login code, welcome, feedback admin notification — all delivered to
      zeljko@dakic.com from the real sender
- [x] Real logout end-to-end (session deleted server-side, cookie cleared)
- [x] Design-token gate in lint; visual drift audit committed

## 2. Pre-launch — remaining

- [ ] **Jake's full manual check** — both stacks side by side
      (`wasp start` :4000 vs `npm run app` :5174, same database)
- [ ] **P1 visual punch list** (visual-drift.md) — recommended before launch:
      - shrink-wrapped page columns (someday/week/settings — one flex fix)
      - Week page missing lens-tinted hero + weekday group cards
      - admin double-sidebar (webapp replaces the shell on /do/admin)
      - sidebar counts/badges (needs contract counts + review routes — small
        contract + op work)
- [ ] **Jake's [decision] items**: FREE gate copy ("another Lens" vs "the Work
      lens"); projects/goals header style (webapp reference is an unstyled
      accident — port implements the checked-in spec)
- [ ] **initializeTimeZone bootstrap** (small contract gap: the daily rollover
      runs UTC until a reminder save stamps the user's zone) — recommended
- [ ] **Deploy `action-amp-next` to Railway** (warm, staging domain) — needs
      Jake's go (new billable service); deploy via CLI from the Dockerfile
- [ ] **Stripe test-mode dry run**: hosted checkout with a test card → webhook →
      plan flip (needs the Railway staging domain from the step above)
- [ ] **Push notification live test**: subscribe in the browser with the prod
      VAPID keys, trigger the daily reminder path
- [ ] **V2 rehearsal**: walk CHECKLIST.md end-to-end, time every step, decide
      `MAINTENANCE_MODE`, fill ANNOUNCEMENT placeholders
- [ ] Final `pg_dump`-pull rehearsal is part of V2 (fresh dump → restore →
      suites green, the V1 flow re-run)

## 3. Switch day (V4 — quiet hour, WITH Jake)

Per CHECKLIST.md, in order: announce → freeze (quiet hour) → fresh pg_dump +
restorable verify → warm-check → **domain flip** (api./app. → the new service)
→ verify sweep (scripts + manual list) → unfreeze → 48h watch.

Notes that de-risk the day:
- **Stripe webhook needs NO change** — the new API serves
  `/webhooks/stripe` on the same `api.actionamp.com` origin
- **Rollback is a domain flip back** (Wasp untouched, stopped-but-startable) —
  scripts/switch/rollback.sh + ROLLBACK.md
- The verify sweep + warm-check scripts are env-driven and production-safe

## 4. Post-launch (V5/V6)

- [ ] Keep Wasp stopped-but-startable 2–4 weeks, then delete (Jake approves —
      gate #5): Wasp services + `webapp/` + Prisma
- [ ] First Drizzle-owned schema migration (Drizzle becomes the source of truth)
- [ ] `docs/` cascade: AGENTS.md routing, feature docs, DESIGN-SYSTEM.md notes
- [ ] deferred.md working list (analytics attribution, attachments fan-out,
      version banner, reorder ops, …)
- [ ] V6 (optional): Neon pooled `DATABASE_URL`
