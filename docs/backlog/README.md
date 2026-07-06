# Backlog (non-feature work)

> Same lifecycle as specs (`draft → ready → building → review → done`), but for
> **non-feature work**: setup, decisions, ops, research, infrastructure, and
> code-side test/bug gaps that don't fit a feature spec. These units carry the
> same frontmatter as specs and appear in the same queue.
>
> The GTM items below were promoted out of ROADMAP §GTM prep B (a prose
> checklist) so they are **tracked, not buried**. They are the actual critical
> path to a real launch — most are user-owned (no code), independent tracks that
> can run while Build works the ready specs. The `lens-*` items were promoted
> out of `docs/tasks/` (now deleted) — code-side gaps spawned from the
> custom-lenses review.

## Index

### GTM (non-code, user-owned)

| ID | Title | Owner | Gates | Status |
|----|-------|-------|-------|--------|
| `gtm-google-oauth` | Create Google Cloud OAuth client | user | social-auth-google (going live) | ready |
| `gtm-stripe-prod` | Verify Stripe prod keys + webhook | user | all billing | ready |
| `gtm-contact-inbox` | Confirm monitored contact addresses | user | legal-pages-oauth signoff | ready |
| `gtm-dns-email` | DNS hygiene + email deliverability | user | auth + billing email placement | ready |
| `gtm-analytics-account` | Pick Plausible/PostHog + create site | user | observability-minimal go-live | ready |
| `gtm-db-backups` | Railway Postgres backup policy | user | one paying user | ready |
| `gtm-founding100-story` | How the first 100 are found | user/discover | Founding 100 success | draft |

### Code-side gaps (Build-owned)

| ID | Title | Parent | Status |
|----|-------|--------|--------|
| `lens-free-gate-loading-edge-cases` | FREE-gate transient bypass + self-heal reset (low-sev) | reviews/custom-lenses.md | draft |
| `lens-integration-test-gaps` | LensesPage test, migration effect, assertLensAllowed e2e, at-cap | reviews/custom-lenses.md | draft |

(One file per unit below. Update status in the file AND here when it moves.)
