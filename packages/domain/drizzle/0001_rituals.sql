-- Rituals (the habits layer) — docs/specs/rituals.md §Entity model.
-- Hand-written additive migration (the first applying one; 0000 is the
-- commented-out introspection pull): three enums + two tables + indexes.
-- The dev DB is managed with `drizzle-kit push`; this file is the durable
-- record for staging/prod. Verified against actionamp_dev 2026-09-19.
CREATE TYPE "RitualInterval" AS ENUM('MORNING', 'MIDDAY', 'EVENING');--> statement-breakpoint
CREATE TYPE "RitualCadence" AS ENUM('DAILY', 'WEEKDAYS', 'WEEKLY', 'INTERVAL');--> statement-breakpoint
CREATE TYPE "RitualMood" AS ENUM('HAPPY', 'NEUTRAL', 'NEGATIVE');--> statement-breakpoint
CREATE TABLE "Ritual" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"lensId" text NOT NULL,
	"name" text NOT NULL,
	"interval" "RitualInterval" DEFAULT 'MORNING' NOT NULL,
	"cadence" "RitualCadence" DEFAULT 'DAILY' NOT NULL,
	"weekday" integer,
	"intervalDays" integer,
	"goalId" text,
	"order" integer DEFAULT 0 NOT NULL,
	"pausedAt" timestamp(3),
	"archivedAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "RitualEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"ritualId" text NOT NULL,
	"userId" text NOT NULL,
	"localDate" date NOT NULL,
	"mood" "RitualMood",
	"note" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX "Ritual_userId_lensId_archivedAt_idx" ON "Ritual" USING btree ("userId" ASC NULLS LAST, "lensId" ASC NULLS LAST, "archivedAt" ASC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "RitualEntry_ritualId_localDate_key" ON "RitualEntry" USING btree ("ritualId" ASC NULLS LAST, "localDate" ASC NULLS LAST);--> statement-breakpoint
CREATE INDEX "RitualEntry_userId_localDate_idx" ON "RitualEntry" USING btree ("userId" ASC NULLS LAST, "localDate" ASC NULLS LAST);--> statement-breakpoint
ALTER TABLE "Ritual" ADD CONSTRAINT "Ritual_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON UPDATE cascade ON DELETE set null;--> statement-breakpoint
ALTER TABLE "Ritual" ADD CONSTRAINT "Ritual_lensId_fkey" FOREIGN KEY ("lensId") REFERENCES "public"."Lens"("id") ON UPDATE cascade ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "Ritual" ADD CONSTRAINT "Ritual_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON UPDATE cascade ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "RitualEntry" ADD CONSTRAINT "RitualEntry_ritualId_fkey" FOREIGN KEY ("ritualId") REFERENCES "public"."Ritual"("id") ON UPDATE cascade ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "RitualEntry" ADD CONSTRAINT "RitualEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON UPDATE cascade ON DELETE cascade;
