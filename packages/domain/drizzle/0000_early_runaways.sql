-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."AdminUserActionType" AS ENUM('GRANT_PRO', 'GRANT_FOUNDER', 'GRANT_FRIEND', 'REMOVE_MANUAL_GRANT', 'DELETE_USER');--> statement-breakpoint
CREATE TYPE "public"."AnalyticsEventName" AS ENUM('LANDING_VIEW', 'PRICING_VIEW', 'FOUNDING_VIEW', 'SIGNUP_STARTED', 'SIGNUP_COMPLETED', 'APP_OPENED', 'ONBOARDING_COMPLETED', 'CAPTURE_CREATED', 'TRIAGE_COMPLETED', 'FOCUS_STARTED', 'TASK_COMPLETED', 'CHECKOUT_STARTED', 'PAYMENT_CONFIRMED', 'LANDING_VARIANT_VIEWED');--> statement-breakpoint
CREATE TYPE "public"."FeedbackStatus" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."InboxItemStatus" AS ENUM('UNPROCESSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."ManualAccessGrant" AS ENUM('PRO', 'FOUNDER', 'FRIEND');--> statement-breakpoint
CREATE TYPE "public"."OnboardingStage" AS ENUM('SAMPLE_TASK', 'CAPTURE', 'TRIAGE', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."PaymentStatus" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."Plan" AS ENUM('FREE', 'PRO', 'FOUNDER');--> statement-breakpoint
CREATE TYPE "public"."Priority" AS ENUM('LOW', 'NORMAL', 'IMPORTANT');--> statement-breakpoint
CREATE TYPE "public"."ProjectType" AS ENUM('STANDARD', 'SIMPLE_LIST');--> statement-breakpoint
CREATE TYPE "public"."ReviewCadence" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."Size" AS ENUM('S', 'M', 'L', 'XL');--> statement-breakpoint
CREATE TYPE "public"."TaskStatus" AS ENUM('SOMEDAY', 'UPCOMING', 'TODAY', 'WONT_DO');--> statement-breakpoint
CREATE TYPE "public"."TaskUpdateKind" AS ENUM('NOTE', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "AdminUserAction" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"actorUserId" text NOT NULL,
	"targetUserId" text,
	"action" "AdminUserActionType" NOT NULL,
	"previousGrant" "ManualAccessGrant",
	"nextGrant" "ManualAccessGrant"
);
--> statement-breakpoint
CREATE TABLE "ApiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"hashedToken" text NOT NULL,
	"label" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastUsedAt" timestamp(3),
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Auth" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "Feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"message" text NOT NULL,
	"userId" text NOT NULL,
	"userName" text,
	"userEmail" text,
	"route" text,
	"section" text,
	"lensId" text,
	"lensName" text,
	"lensColor" text,
	"userAgent" text,
	"status" "FeedbackStatus" DEFAULT 'OPEN' NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"shortId" text NOT NULL,
	"deletedAt" timestamp(3),
	"timezone" text,
	"viewport" text
);
--> statement-breakpoint
CREATE TABLE "Goal" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isDone" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completedAt" timestamp(3),
	"userId" text NOT NULL,
	"lensId" text NOT NULL,
	"permalink" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxAttachment" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"inboxItemId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AnalyticsSession" (
	"id" text PRIMARY KEY NOT NULL,
	"visitorId" text NOT NULL,
	"userId" text,
	"firstSeenAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastSeenAt" timestamp(3) NOT NULL,
	"referrerHost" text,
	"utmSource" text,
	"utmMedium" text,
	"utmCampaign" text,
	"utmContent" text,
	"utmTerm" text,
	"initialPath" text,
	"deviceClass" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxItem" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"status" "InboxItemStatus" DEFAULT 'UNPROCESSED' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text NOT NULL,
	"parsedPriority" "Priority",
	"parsedSize" "Size",
	"parsedTags" text[],
	"parsedProject" text,
	"archivedAt" timestamp(3),
	"parsedLens" text,
	"content" text,
	"sourceUrl" text,
	"title" text,
	"parsedProjectId" text,
	"parsedLensId" text,
	"parsedScheduledDate" date,
	"parsedSnoozedUntil" timestamp(3) with time zone
);
--> statement-breakpoint
CREATE TABLE "LoginEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"provider" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Lens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text NOT NULL,
	"color" text,
	"purpose" text,
	"isDefault" boolean DEFAULT false NOT NULL,
	"isIncluded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ListItem" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"isDone" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"completedAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"userId" text NOT NULL,
	"content" text,
	"sourceUrl" text,
	"projectId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MagicLoginChallenge" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"codeHash" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"consumedAt" timestamp(3),
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Payment" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text,
	"stripePaymentIntentId" text,
	"stripeInvoiceId" text,
	"stripeCheckoutSessionId" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"plan" "Plan" NOT NULL,
	"description" text NOT NULL,
	"status" "PaymentStatus" DEFAULT 'PENDING' NOT NULL,
	"paidAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "Project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"dueDate" date,
	"isDone" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completedAt" timestamp(3),
	"userId" text NOT NULL,
	"lensId" text NOT NULL,
	"goalId" text,
	"order" integer DEFAULT 0 NOT NULL,
	"permalink" text NOT NULL,
	"archivedAt" timestamp(3),
	"type" "ProjectType" DEFAULT 'STANDARD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PushSubscription" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Resource" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"notes" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text NOT NULL,
	"projectId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Review" (
	"id" text PRIMARY KEY NOT NULL,
	"cadence" "ReviewCadence" NOT NULL,
	"periodStart" timestamp(3) NOT NULL,
	"periodEnd" timestamp(3) NOT NULL,
	"timeZone" text NOT NULL,
	"answers" jsonb NOT NULL,
	"snapshot" jsonb,
	"completedAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Task" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"isDone" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text NOT NULL,
	"completedAt" timestamp(3),
	"content" text,
	"goalId" text,
	"lensId" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"priority" "Priority" DEFAULT 'NORMAL' NOT NULL,
	"projectId" text,
	"size" "Size" DEFAULT 'M' NOT NULL,
	"status" "TaskStatus" DEFAULT 'SOMEDAY' NOT NULL,
	"startedAt" timestamp(3),
	"permalink" text NOT NULL,
	"outcome" text,
	"isOnboardingSample" boolean DEFAULT false NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"scheduledDate" date,
	"snoozedUntil" timestamp(3) with time zone
);
--> statement-breakpoint
CREATE TABLE "TaskAttachment" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"taskId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TaskSession" (
	"id" text PRIMARY KEY NOT NULL,
	"startedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"endedAt" timestamp(3),
	"taskId" text NOT NULL,
	"userId" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"plannedMinutes" integer
);
--> statement-breakpoint
CREATE TABLE "ProjectAttachment" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"projectId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AnalyticsEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"name" "AnalyticsEventName" NOT NULL,
	"occurredAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"route" text,
	"appVersion" text,
	"metadata" jsonb,
	"sessionId" text NOT NULL,
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"firstName" text NOT NULL,
	"plan" "Plan" DEFAULT 'FREE' NOT NULL,
	"planRenewsAt" timestamp(3),
	"stripeCustomerId" text,
	"fullName" text NOT NULL,
	"preferredName" text,
	"hasSeenOnboarding" boolean DEFAULT false NOT NULL,
	"lastTodayRolloverAt" timestamp(3),
	"isAdmin" boolean DEFAULT false NOT NULL,
	"dailyReminderEnabled" boolean DEFAULT false NOT NULL,
	"dailyReminderTime" text DEFAULT '09:00' NOT NULL,
	"dailyReminderTimeZone" text DEFAULT 'UTC' NOT NULL,
	"lastDailyReminderAt" timestamp(3),
	"todayCap" integer DEFAULT 5 NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastActiveAt" timestamp(3),
	"focusSessionMinutes" integer DEFAULT 25 NOT NULL,
	"todayReviewEnabled" boolean DEFAULT true NOT NULL,
	"weekReviewEnabled" boolean DEFAULT true NOT NULL,
	"monthReviewEnabled" boolean DEFAULT true NOT NULL,
	"onboardingStage" "OnboardingStage" DEFAULT 'COMPLETE' NOT NULL,
	"lastLoginAt" timestamp(3),
	"manualAccessGrant" "ManualAccessGrant",
	"manualGrantAt" timestamp(3),
	"timeZone" text
);
--> statement-breakpoint
CREATE TABLE "ListItemAttachment" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"listItemId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ResourceAttachment" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"resourceId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TaskUpdate" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"taskId" text NOT NULL,
	"kind" "TaskUpdateKind" DEFAULT 'NOTE' NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_TagToTask" (
	"A" text NOT NULL,
	"B" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuthIdentity" (
	"providerName" text NOT NULL,
	"providerUserId" text NOT NULL,
	"providerData" text DEFAULT '{}' NOT NULL,
	"authId" text NOT NULL,
	CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY("providerUserId","providerName")
);
--> statement-breakpoint
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_lensId_fkey" FOREIGN KEY ("lensId") REFERENCES "public"."Lens"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "InboxAttachment" ADD CONSTRAINT "InboxAttachment_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "public"."InboxItem"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AnalyticsSession" ADD CONSTRAINT "AnalyticsSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Lens" ADD CONSTRAINT "Lens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_lensId_fkey" FOREIGN KEY ("lensId") REFERENCES "public"."Lens"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Auth"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Task" ADD CONSTRAINT "Task_lensId_fkey" FOREIGN KEY ("lensId") REFERENCES "public"."Lens"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."AnalyticsSession"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ListItemAttachment" ADD CONSTRAINT "ListItemAttachment_listItemId_fkey" FOREIGN KEY ("listItemId") REFERENCES "public"."ListItem"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "public"."Resource"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "_TagToTask" ADD CONSTRAINT "_TagToTask_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Tag"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "_TagToTask" ADD CONSTRAINT "_TagToTask_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_authId_fkey" FOREIGN KEY ("authId") REFERENCES "public"."Auth"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "AdminUserAction_actorUserId_createdAt_idx" ON "AdminUserAction" USING btree ("actorUserId" text_ops,"createdAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "AdminUserAction_targetUserId_createdAt_idx" ON "AdminUserAction" USING btree ("targetUserId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ApiKey_hashedToken_key" ON "ApiKey" USING btree ("hashedToken" text_ops);--> statement-breakpoint
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Auth_userId_key" ON "Auth" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Feedback_shortId_key" ON "Feedback" USING btree ("shortId" text_ops);--> statement-breakpoint
CREATE INDEX "Goal_userId_createdAt_idx" ON "Goal" USING btree ("userId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Goal_userId_name_key" ON "Goal" USING btree ("userId" text_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Goal_userId_permalink_key" ON "Goal" USING btree ("userId" text_ops,"permalink" text_ops);--> statement-breakpoint
CREATE INDEX "AnalyticsSession_firstSeenAt_idx" ON "AnalyticsSession" USING btree ("firstSeenAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "AnalyticsSession_userId_idx" ON "AnalyticsSession" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "AnalyticsSession_visitorId_key" ON "AnalyticsSession" USING btree ("visitorId" text_ops);--> statement-breakpoint
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent" USING btree ("userId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Lens_userId_name_key" ON "Lens" USING btree ("userId" text_ops,"name" text_ops);--> statement-breakpoint
CREATE INDEX "ListItem_projectId_isDone_order_idx" ON "ListItem" USING btree ("projectId" int4_ops,"isDone" int4_ops,"order" int4_ops);--> statement-breakpoint
CREATE INDEX "MagicLoginChallenge_email_createdAt_idx" ON "MagicLoginChallenge" USING btree ("email" timestamp_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE INDEX "MagicLoginChallenge_expiresAt_idx" ON "MagicLoginChallenge" USING btree ("expiresAt" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MagicLoginChallenge_tokenHash_key" ON "MagicLoginChallenge" USING btree ("tokenHash" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment" USING btree ("stripeInvoiceId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment" USING btree ("stripePaymentIntentId" text_ops);--> statement-breakpoint
CREATE INDEX "Project_userId_archivedAt_idx" ON "Project" USING btree ("userId" text_ops,"archivedAt" text_ops);--> statement-breakpoint
CREATE INDEX "Project_userId_createdAt_idx" ON "Project" USING btree ("userId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Project_userId_permalink_key" ON "Project" USING btree ("userId" text_ops,"permalink" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription" USING btree ("endpoint" text_ops);--> statement-breakpoint
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE INDEX "Review_userId_cadence_periodStart_idx" ON "Review" USING btree ("userId" text_ops,"cadence" text_ops,"periodStart" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Review_userId_cadence_periodStart_key" ON "Review" USING btree ("userId" text_ops,"cadence" text_ops,"periodStart" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Session_id_key" ON "Session" USING btree ("id" text_ops);--> statement-breakpoint
CREATE INDEX "Session_userId_idx" ON "Session" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag" USING btree ("userId" text_ops,"name" text_ops);--> statement-breakpoint
CREATE INDEX "Task_userId_completedAt_idx" ON "Task" USING btree ("userId" text_ops,"completedAt" text_ops);--> statement-breakpoint
CREATE INDEX "Task_userId_createdAt_idx" ON "Task" USING btree ("userId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Task_userId_permalink_key" ON "Task" USING btree ("userId" text_ops,"permalink" text_ops);--> statement-breakpoint
CREATE INDEX "Task_userId_scheduledDate_idx" ON "Task" USING btree ("userId" date_ops,"scheduledDate" date_ops);--> statement-breakpoint
CREATE INDEX "Task_userId_snoozedUntil_idx" ON "Task" USING btree ("userId" text_ops,"snoozedUntil" text_ops);--> statement-breakpoint
CREATE INDEX "TaskSession_taskId_startedAt_idx" ON "TaskSession" USING btree ("taskId" text_ops,"startedAt" text_ops);--> statement-breakpoint
CREATE INDEX "AnalyticsEvent_name_occurredAt_idx" ON "AnalyticsEvent" USING btree ("name" timestamp_ops,"occurredAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "AnalyticsEvent_sessionId_occurredAt_idx" ON "AnalyticsEvent" USING btree ("sessionId" timestamp_ops,"occurredAt" text_ops);--> statement-breakpoint
CREATE INDEX "AnalyticsEvent_userId_occurredAt_idx" ON "AnalyticsEvent" USING btree ("userId" text_ops,"occurredAt" text_ops);--> statement-breakpoint
CREATE INDEX "User_createdAt_idx" ON "User" USING btree ("createdAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "User_lastActiveAt_idx" ON "User" USING btree ("lastActiveAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "User_lastLoginAt_idx" ON "User" USING btree ("lastLoginAt" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "_TagToTask_AB_unique" ON "_TagToTask" USING btree ("A" text_ops,"B" text_ops);--> statement-breakpoint
CREATE INDEX "_TagToTask_B_index" ON "_TagToTask" USING btree ("B" text_ops);
*/