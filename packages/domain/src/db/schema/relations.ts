import { relations } from "drizzle-orm/relations";
import { user, apiKey, auth, feedback, lens, goal, inboxItem, inboxAttachment, analyticsSession, loginEvent, project, listItem, payment, pushSubscription, resource, review, session, tag, task, taskAttachment, taskSession, projectAttachment, analyticsEvent, listItemAttachment, resourceAttachment, taskUpdate, tagToTask, authIdentity } from "./index.js";

export const apiKeyRelations = relations(apiKey, ({one}) => ({
	user: one(user, {
		fields: [apiKey.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	apiKeys: many(apiKey),
	auths: many(auth),
	feedbacks: many(feedback),
	goals: many(goal),
	analyticsSessions: many(analyticsSession),
	inboxItems: many(inboxItem),
	loginEvents: many(loginEvent),
	lens: many(lens),
	listItems: many(listItem),
	payments: many(payment),
	projects: many(project),
	pushSubscriptions: many(pushSubscription),
	resources: many(resource),
	reviews: many(review),
	tags: many(tag),
	tasks: many(task),
	taskSessions: many(taskSession),
	analyticsEvents: many(analyticsEvent),
	taskUpdates: many(taskUpdate),
}));

export const authRelations = relations(auth, ({one, many}) => ({
	user: one(user, {
		fields: [auth.userId],
		references: [user.id]
	}),
	sessions: many(session),
	authIdentities: many(authIdentity),
}));

export const feedbackRelations = relations(feedback, ({one}) => ({
	user: one(user, {
		fields: [feedback.userId],
		references: [user.id]
	}),
}));

export const goalRelations = relations(goal, ({one, many}) => ({
	len: one(lens, {
		fields: [goal.lensId],
		references: [lens.id]
	}),
	user: one(user, {
		fields: [goal.userId],
		references: [user.id]
	}),
	projects: many(project),
	tasks: many(task),
}));

export const lensRelations = relations(lens, ({one, many}) => ({
	goals: many(goal),
	user: one(user, {
		fields: [lens.userId],
		references: [user.id]
	}),
	projects: many(project),
	tasks: many(task),
}));

export const inboxAttachmentRelations = relations(inboxAttachment, ({one}) => ({
	inboxItem: one(inboxItem, {
		fields: [inboxAttachment.inboxItemId],
		references: [inboxItem.id]
	}),
}));

export const inboxItemRelations = relations(inboxItem, ({one, many}) => ({
	inboxAttachments: many(inboxAttachment),
	user: one(user, {
		fields: [inboxItem.userId],
		references: [user.id]
	}),
}));

export const analyticsSessionRelations = relations(analyticsSession, ({one, many}) => ({
	user: one(user, {
		fields: [analyticsSession.userId],
		references: [user.id]
	}),
	analyticsEvents: many(analyticsEvent),
}));

export const loginEventRelations = relations(loginEvent, ({one}) => ({
	user: one(user, {
		fields: [loginEvent.userId],
		references: [user.id]
	}),
}));

export const listItemRelations = relations(listItem, ({one, many}) => ({
	project: one(project, {
		fields: [listItem.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [listItem.userId],
		references: [user.id]
	}),
	listItemAttachments: many(listItemAttachment),
}));

export const projectRelations = relations(project, ({one, many}) => ({
	listItems: many(listItem),
	goal: one(goal, {
		fields: [project.goalId],
		references: [goal.id]
	}),
	len: one(lens, {
		fields: [project.lensId],
		references: [lens.id]
	}),
	user: one(user, {
		fields: [project.userId],
		references: [user.id]
	}),
	resources: many(resource),
	tasks: many(task),
	projectAttachments: many(projectAttachment),
}));

export const paymentRelations = relations(payment, ({one}) => ({
	user: one(user, {
		fields: [payment.userId],
		references: [user.id]
	}),
}));

export const pushSubscriptionRelations = relations(pushSubscription, ({one}) => ({
	user: one(user, {
		fields: [pushSubscription.userId],
		references: [user.id]
	}),
}));

export const resourceRelations = relations(resource, ({one, many}) => ({
	project: one(project, {
		fields: [resource.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [resource.userId],
		references: [user.id]
	}),
	resourceAttachments: many(resourceAttachment),
}));

export const reviewRelations = relations(review, ({one}) => ({
	user: one(user, {
		fields: [review.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	auth: one(auth, {
		fields: [session.userId],
		references: [auth.id]
	}),
}));

export const tagRelations = relations(tag, ({one, many}) => ({
	user: one(user, {
		fields: [tag.userId],
		references: [user.id]
	}),
	tagToTasks: many(tagToTask),
}));

export const taskRelations = relations(task, ({one, many}) => ({
	goal: one(goal, {
		fields: [task.goalId],
		references: [goal.id]
	}),
	len: one(lens, {
		fields: [task.lensId],
		references: [lens.id]
	}),
	project: one(project, {
		fields: [task.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [task.userId],
		references: [user.id]
	}),
	taskAttachments: many(taskAttachment),
	taskSessions: many(taskSession),
	taskUpdates: many(taskUpdate),
	tagToTasks: many(tagToTask),
}));

export const taskAttachmentRelations = relations(taskAttachment, ({one}) => ({
	task: one(task, {
		fields: [taskAttachment.taskId],
		references: [task.id]
	}),
}));

export const taskSessionRelations = relations(taskSession, ({one}) => ({
	task: one(task, {
		fields: [taskSession.taskId],
		references: [task.id]
	}),
	user: one(user, {
		fields: [taskSession.userId],
		references: [user.id]
	}),
}));

export const projectAttachmentRelations = relations(projectAttachment, ({one}) => ({
	project: one(project, {
		fields: [projectAttachment.projectId],
		references: [project.id]
	}),
}));

export const analyticsEventRelations = relations(analyticsEvent, ({one}) => ({
	analyticsSession: one(analyticsSession, {
		fields: [analyticsEvent.sessionId],
		references: [analyticsSession.id]
	}),
	user: one(user, {
		fields: [analyticsEvent.userId],
		references: [user.id]
	}),
}));

export const listItemAttachmentRelations = relations(listItemAttachment, ({one}) => ({
	listItem: one(listItem, {
		fields: [listItemAttachment.listItemId],
		references: [listItem.id]
	}),
}));

export const resourceAttachmentRelations = relations(resourceAttachment, ({one}) => ({
	resource: one(resource, {
		fields: [resourceAttachment.resourceId],
		references: [resource.id]
	}),
}));

export const taskUpdateRelations = relations(taskUpdate, ({one}) => ({
	task: one(task, {
		fields: [taskUpdate.taskId],
		references: [task.id]
	}),
	user: one(user, {
		fields: [taskUpdate.userId],
		references: [user.id]
	}),
}));

export const tagToTaskRelations = relations(tagToTask, ({one}) => ({
	tag: one(tag, {
		fields: [tagToTask.a],
		references: [tag.id]
	}),
	task: one(task, {
		fields: [tagToTask.b],
		references: [task.id]
	}),
}));

export const authIdentityRelations = relations(authIdentity, ({one}) => ({
	auth: one(auth, {
		fields: [authIdentity.authId],
		references: [auth.id]
	}),
}));