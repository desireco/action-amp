-- Share capture: after-save landing (#21, 2026-10-17) — where the share
-- review tab goes once a capture is confirmed: 'inbox' (open the Inbox and
-- triage now) or 'close' (just close the tab; the item already saved).
-- Additive ALTER only; verified against actionamp_dev (drizzle-kit push
-- reports no changes after applying).
ALTER TABLE "User" ADD COLUMN "shareAfterSave" text DEFAULT 'inbox' NOT NULL;
