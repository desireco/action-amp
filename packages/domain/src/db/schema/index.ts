import { pgTable, index, text, timestamp, uniqueIndex, foreignKey, boolean, integer, date, jsonb, varchar, primaryKey, pgEnum, customType } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// bytea — drizzle-kit pull cannot infer this PostgreSQL type and emits an
// uncompiled `unknown` placeholder. Hand-bound here to Uint8Array (Prisma's
// Bytes maps to Uint8Array; Buffer is a Uint8Array subclass at runtime).
export const bytea = customType<{ data: Uint8Array }>({
	dataType() {
		return "bytea";
	},
});

export const adminUserActionType = pgEnum("AdminUserActionType", ['GRANT_PRO', 'GRANT_FOUNDER', 'GRANT_FRIEND', 'REMOVE_MANUAL_GRANT', 'DELETE_USER'])
export const analyticsEventName = pgEnum("AnalyticsEventName", ['LANDING_VIEW', 'PRICING_VIEW', 'FOUNDING_VIEW', 'SIGNUP_STARTED', 'SIGNUP_COMPLETED', 'APP_OPENED', 'ONBOARDING_COMPLETED', 'CAPTURE_CREATED', 'TRIAGE_COMPLETED', 'FOCUS_STARTED', 'TASK_COMPLETED', 'CHECKOUT_STARTED', 'PAYMENT_CONFIRMED', 'LANDING_VARIANT_VIEWED'])
export const feedbackStatus = pgEnum("FeedbackStatus", ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
export const inboxItemStatus = pgEnum("InboxItemStatus", ['UNPROCESSED', 'ARCHIVED'])
export const manualAccessGrant = pgEnum("ManualAccessGrant", ['PRO', 'FOUNDER', 'FRIEND'])
export const onboardingStage = pgEnum("OnboardingStage", ['SAMPLE_TASK', 'CAPTURE', 'TRIAGE', 'COMPLETE'])
export const paymentStatus = pgEnum("PaymentStatus", ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'])
export const plan = pgEnum("Plan", ['FREE', 'PRO', 'FOUNDER'])
export const priority = pgEnum("Priority", ['LOW', 'NORMAL', 'IMPORTANT'])
export const projectType = pgEnum("ProjectType", ['STANDARD', 'SIMPLE_LIST'])
export const reviewCadence = pgEnum("ReviewCadence", ['DAILY', 'WEEKLY', 'MONTHLY'])
export const size = pgEnum("Size", ['S', 'M', 'L', 'XL'])
export const taskStatus = pgEnum("TaskStatus", ['SOMEDAY', 'UPCOMING', 'TODAY', 'WONT_DO'])
export const taskUpdateKind = pgEnum("TaskUpdateKind", ['NOTE', 'COMPLETED'])


export const adminUserAction = pgTable("AdminUserAction", {
	id: text().primaryKey().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	actorUserId: text().notNull(),
	targetUserId: text(),
	action: adminUserActionType().notNull(),
	previousGrant: manualAccessGrant(),
	nextGrant: manualAccessGrant(),
}, (table) => [
	index("AdminUserAction_actorUserId_createdAt_idx").using("btree", table.actorUserId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("AdminUserAction_targetUserId_createdAt_idx").using("btree", table.targetUserId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
]);

export const apiKey = pgTable("ApiKey", {
	id: text().primaryKey().notNull(),
	hashedToken: text().notNull(),
	label: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastUsedAt: timestamp({ precision: 3, mode: 'string' }),
	userId: text().notNull(),
}, (table) => [
	uniqueIndex("ApiKey_hashedToken_key").using("btree", table.hashedToken.asc().nullsLast().op("text_ops")),
	index("ApiKey_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ApiKey_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const auth = pgTable("Auth", {
	id: text().primaryKey().notNull(),
	userId: text(),
}, (table) => [
	uniqueIndex("Auth_userId_key").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Auth_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const feedback = pgTable("Feedback", {
	id: text().primaryKey().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	message: text().notNull(),
	userId: text().notNull(),
	userName: text(),
	userEmail: text(),
	route: text(),
	section: text(),
	lensId: text(),
	lensName: text(),
	lensColor: text(),
	userAgent: text(),
	status: feedbackStatus().default('OPEN').notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	shortId: text().notNull(),
	deletedAt: timestamp({ precision: 3, mode: 'string' }),
	timezone: text(),
	viewport: text(),
}, (table) => [
	uniqueIndex("Feedback_shortId_key").using("btree", table.shortId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Feedback_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const goal = pgTable("Goal", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	isDone: boolean().default(false).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	completedAt: timestamp({ precision: 3, mode: 'string' }),
	userId: text().notNull(),
	lensId: text().notNull(),
	permalink: text().notNull(),
}, (table) => [
	index("Goal_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	uniqueIndex("Goal_userId_name_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	uniqueIndex("Goal_userId_permalink_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.permalink.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.lensId],
			foreignColumns: [lens.id],
			name: "Goal_lensId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Goal_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const inboxAttachment = pgTable("InboxAttachment", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	mimeType: text().notNull(),
	size: integer().notNull(),
	data: bytea("data").notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	inboxItemId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.inboxItemId],
			foreignColumns: [inboxItem.id],
			name: "InboxAttachment_inboxItemId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const analyticsSession = pgTable("AnalyticsSession", {
	id: text().primaryKey().notNull(),
	visitorId: text().notNull(),
	userId: text(),
	firstSeenAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastSeenAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	referrerHost: text(),
	utmSource: text(),
	utmMedium: text(),
	utmCampaign: text(),
	utmContent: text(),
	utmTerm: text(),
	initialPath: text(),
	deviceClass: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("AnalyticsSession_firstSeenAt_idx").using("btree", table.firstSeenAt.asc().nullsLast().op("timestamp_ops")),
	index("AnalyticsSession_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	uniqueIndex("AnalyticsSession_visitorId_key").using("btree", table.visitorId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "AnalyticsSession_userId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const inboxItem = pgTable("InboxItem", {
	id: text().primaryKey().notNull(),
	text: text().notNull(),
	status: inboxItemStatus().default('UNPROCESSED').notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: text().notNull(),
	parsedPriority: priority(),
	parsedSize: size(),
	parsedTags: text().array(),
	parsedProject: text(),
	archivedAt: timestamp({ precision: 3, mode: 'string' }),
	parsedLens: text(),
	content: text(),
	sourceUrl: text(),
	title: text(),
	parsedProjectId: text(),
	parsedLensId: text(),
	parsedScheduledDate: date(),
	parsedSnoozedUntil: timestamp({ precision: 3, withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "InboxItem_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const loginEvent = pgTable("LoginEvent", {
	id: text().primaryKey().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	provider: text().notNull(),
	userId: text().notNull(),
}, (table) => [
	index("LoginEvent_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "LoginEvent_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const lens = pgTable("Lens", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: text().notNull(),
	color: text(),
	purpose: text(),
	isDefault: boolean().default(false).notNull(),
	isIncluded: boolean().default(false).notNull(),
}, (table) => [
	uniqueIndex("Lens_userId_name_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Lens_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const listItem = pgTable("ListItem", {
	id: text().primaryKey().notNull(),
	text: text().notNull(),
	isDone: boolean().default(false).notNull(),
	order: integer().default(0).notNull(),
	completedAt: timestamp({ precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	userId: text().notNull(),
	content: text(),
	sourceUrl: text(),
	projectId: text().notNull(),
}, (table) => [
	index("ListItem_projectId_isDone_order_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops"), table.isDone.asc().nullsLast().op("int4_ops"), table.order.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [project.id],
			name: "ListItem_projectId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ListItem_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const magicLoginChallenge = pgTable("MagicLoginChallenge", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	codeHash: text().notNull(),
	tokenHash: text().notNull(),
	expiresAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	consumedAt: timestamp({ precision: 3, mode: 'string' }),
	attempts: integer().default(0).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("MagicLoginChallenge_email_createdAt_idx").using("btree", table.email.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("MagicLoginChallenge_expiresAt_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	uniqueIndex("MagicLoginChallenge_tokenHash_key").using("btree", table.tokenHash.asc().nullsLast().op("text_ops")),
]);

export const payment = pgTable("Payment", {
	id: text().primaryKey().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: text(),
	stripePaymentIntentId: text(),
	stripeInvoiceId: text(),
	stripeCheckoutSessionId: text(),
	amount: integer().notNull(),
	currency: text().default('usd').notNull(),
	plan: plan().notNull(),
	description: text().notNull(),
	status: paymentStatus().default('PENDING').notNull(),
	paidAt: timestamp({ precision: 3, mode: 'string' }),
}, (table) => [
	uniqueIndex("Payment_stripeInvoiceId_key").using("btree", table.stripeInvoiceId.asc().nullsLast().op("text_ops")),
	uniqueIndex("Payment_stripePaymentIntentId_key").using("btree", table.stripePaymentIntentId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Payment_userId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const project = pgTable("Project", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	dueDate: date(),
	isDone: boolean().default(false).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	completedAt: timestamp({ precision: 3, mode: 'string' }),
	userId: text().notNull(),
	lensId: text().notNull(),
	goalId: text(),
	order: integer().default(0).notNull(),
	permalink: text().notNull(),
	archivedAt: timestamp({ precision: 3, mode: 'string' }),
	type: projectType().default('STANDARD').notNull(),
}, (table) => [
	index("Project_userId_archivedAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.archivedAt.asc().nullsLast().op("text_ops")),
	index("Project_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	uniqueIndex("Project_userId_permalink_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.permalink.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.goalId],
			foreignColumns: [goal.id],
			name: "Project_goalId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.lensId],
			foreignColumns: [lens.id],
			name: "Project_lensId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Project_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const pushSubscription = pgTable("PushSubscription", {
	id: text().primaryKey().notNull(),
	endpoint: text().notNull(),
	p256Dh: text().notNull(),
	auth: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	userId: text().notNull(),
}, (table) => [
	uniqueIndex("PushSubscription_endpoint_key").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
	index("PushSubscription_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "PushSubscription_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const resource = pgTable("Resource", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	url: text(),
	notes: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: text().notNull(),
	projectId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [project.id],
			name: "Resource_projectId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Resource_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const review = pgTable("Review", {
	id: text().primaryKey().notNull(),
	cadence: reviewCadence().notNull(),
	periodStart: timestamp({ precision: 3, mode: 'string' }).notNull(),
	periodEnd: timestamp({ precision: 3, mode: 'string' }).notNull(),
	timeZone: text().notNull(),
	answers: jsonb().notNull(),
	snapshot: jsonb(),
	completedAt: timestamp({ precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	userId: text().notNull(),
}, (table) => [
	index("Review_userId_cadence_periodStart_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.cadence.asc().nullsLast().op("text_ops"), table.periodStart.asc().nullsLast().op("text_ops")),
	uniqueIndex("Review_userId_cadence_periodStart_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.cadence.asc().nullsLast().op("text_ops"), table.periodStart.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Review_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const session = pgTable("Session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	userId: text().notNull(),
}, (table) => [
	uniqueIndex("Session_id_key").using("btree", table.id.asc().nullsLast().op("text_ops")),
	index("Session_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [auth.id],
			name: "Session_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const tag = pgTable("Tag", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	color: text().notNull(),
	userId: text().notNull(),
}, (table) => [
	uniqueIndex("Tag_userId_name_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Tag_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const task = pgTable("Task", {
	id: text().primaryKey().notNull(),
	description: text().notNull(),
	isDone: boolean().default(false).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: text().notNull(),
	completedAt: timestamp({ precision: 3, mode: 'string' }),
	content: text(),
	goalId: text(),
	lensId: text().notNull(),
	order: integer().default(0).notNull(),
	priority: priority().default('NORMAL').notNull(),
	projectId: text(),
	size: size().default('M').notNull(),
	status: taskStatus().default('SOMEDAY').notNull(),
	startedAt: timestamp({ precision: 3, mode: 'string' }),
	permalink: text().notNull(),
	outcome: text(),
	isOnboardingSample: boolean().default(false).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	scheduledDate: date(),
	snoozedUntil: timestamp({ precision: 3, withTimezone: true, mode: 'string' }),
}, (table) => [
	index("Task_userId_completedAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.completedAt.asc().nullsLast().op("text_ops")),
	index("Task_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	uniqueIndex("Task_userId_permalink_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.permalink.asc().nullsLast().op("text_ops")),
	index("Task_userId_scheduledDate_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.scheduledDate.asc().nullsLast().op("date_ops")),
	index("Task_userId_snoozedUntil_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.snoozedUntil.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.goalId],
			foreignColumns: [goal.id],
			name: "Task_goalId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.lensId],
			foreignColumns: [lens.id],
			name: "Task_lensId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [project.id],
			name: "Task_projectId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Task_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const taskAttachment = pgTable("TaskAttachment", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	mimeType: text().notNull(),
	size: integer().notNull(),
	data: bytea("data").notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	taskId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [task.id],
			name: "TaskAttachment_taskId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const taskSession = pgTable("TaskSession", {
	id: text().primaryKey().notNull(),
	startedAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	endedAt: timestamp({ precision: 3, mode: 'string' }),
	taskId: text().notNull(),
	userId: text().notNull(),
	completed: boolean().default(false).notNull(),
	plannedMinutes: integer(),
}, (table) => [
	index("TaskSession_taskId_startedAt_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops"), table.startedAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [task.id],
			name: "TaskSession_taskId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "TaskSession_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const projectAttachment = pgTable("ProjectAttachment", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	mimeType: text().notNull(),
	size: integer().notNull(),
	data: bytea("data").notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	projectId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [project.id],
			name: "ProjectAttachment_projectId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const prismaMigrations = pgTable("_prisma_migrations", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	checksum: varchar({ length: 64 }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	logs: text(),
	rolledBackAt: timestamp("rolled_back_at", { withTimezone: true, mode: 'string' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
});

export const analyticsEvent = pgTable("AnalyticsEvent", {
	id: text().primaryKey().notNull(),
	name: analyticsEventName().notNull(),
	occurredAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	route: text(),
	appVersion: text(),
	metadata: jsonb(),
	sessionId: text().notNull(),
	userId: text(),
}, (table) => [
	index("AnalyticsEvent_name_occurredAt_idx").using("btree", table.name.asc().nullsLast().op("timestamp_ops"), table.occurredAt.asc().nullsLast().op("timestamp_ops")),
	index("AnalyticsEvent_sessionId_occurredAt_idx").using("btree", table.sessionId.asc().nullsLast().op("timestamp_ops"), table.occurredAt.asc().nullsLast().op("text_ops")),
	index("AnalyticsEvent_userId_occurredAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.occurredAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [analyticsSession.id],
			name: "AnalyticsEvent_sessionId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "AnalyticsEvent_userId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const user = pgTable("User", {
	id: text().primaryKey().notNull(),
	firstName: text().notNull(),
	plan: plan().default('FREE').notNull(),
	planRenewsAt: timestamp({ precision: 3, mode: 'string' }),
	stripeCustomerId: text(),
	fullName: text().notNull(),
	preferredName: text(),
	hasSeenOnboarding: boolean().default(false).notNull(),
	lastTodayRolloverAt: timestamp({ precision: 3, mode: 'string' }),
	isAdmin: boolean().default(false).notNull(),
	dailyReminderEnabled: boolean().default(false).notNull(),
	dailyReminderTime: text().default('09:00').notNull(),
	dailyReminderTimeZone: text().default('UTC').notNull(),
	lastDailyReminderAt: timestamp({ precision: 3, mode: 'string' }),
	todayCap: integer().default(5).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastActiveAt: timestamp({ precision: 3, mode: 'string' }),
	focusSessionMinutes: integer().default(25).notNull(),
	todayReviewEnabled: boolean().default(true).notNull(),
	weekReviewEnabled: boolean().default(true).notNull(),
	monthReviewEnabled: boolean().default(true).notNull(),
	onboardingStage: onboardingStage().default('COMPLETE').notNull(),
	lastLoginAt: timestamp({ precision: 3, mode: 'string' }),
	manualAccessGrant: manualAccessGrant(),
	manualGrantAt: timestamp({ precision: 3, mode: 'string' }),
	timeZone: text(),
}, (table) => [
	index("User_createdAt_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("User_lastActiveAt_idx").using("btree", table.lastActiveAt.asc().nullsLast().op("timestamp_ops")),
	index("User_lastLoginAt_idx").using("btree", table.lastLoginAt.asc().nullsLast().op("timestamp_ops")),
]);

export const listItemAttachment = pgTable("ListItemAttachment", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	mimeType: text().notNull(),
	size: integer().notNull(),
	data: bytea("data").notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	listItemId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.listItemId],
			foreignColumns: [listItem.id],
			name: "ListItemAttachment_listItemId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const resourceAttachment = pgTable("ResourceAttachment", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	mimeType: text().notNull(),
	size: integer().notNull(),
	data: bytea("data").notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	resourceId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.resourceId],
			foreignColumns: [resource.id],
			name: "ResourceAttachment_resourceId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const taskUpdate = pgTable("TaskUpdate", {
	id: text().primaryKey().notNull(),
	body: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	taskId: text().notNull(),
	kind: taskUpdateKind().default('NOTE').notNull(),
	userId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [task.id],
			name: "TaskUpdate_taskId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "TaskUpdate_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const tagToTask = pgTable("_TagToTask", {
	a: text("A").notNull(),
	b: text("B").notNull(),
}, (table) => [
	uniqueIndex("_TagToTask_AB_unique").using("btree", table.a.asc().nullsLast().op("text_ops"), table.b.asc().nullsLast().op("text_ops")),
	index().using("btree", table.b.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.a],
			foreignColumns: [tag.id],
			name: "_TagToTask_A_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.b],
			foreignColumns: [task.id],
			name: "_TagToTask_B_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const authIdentity = pgTable("AuthIdentity", {
	providerName: text().notNull(),
	providerUserId: text().notNull(),
	providerData: text().default('{}').notNull(),
	authId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.authId],
			foreignColumns: [auth.id],
			name: "AuthIdentity_authId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	primaryKey({ columns: [table.providerUserId, table.providerName], name: "AuthIdentity_pkey"}),
]);
