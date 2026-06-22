import { action, api, app, page, query, route } from "@wasp.sh/spec";
import { App } from "./src/App" with { type: "ref" };
import { WhatNowPage } from "./src/app/WhatNowPage" with { type: "ref" };
import { InboxPage } from "./src/app/InboxPage" with { type: "ref" };
import { InboxTriagePage } from "./src/app/InboxTriagePage" with { type: "ref" };
import { SettingsPage } from "./src/app/SettingsPage" with { type: "ref" };
import { BillingPage } from "./src/app/BillingPage" with { type: "ref" };
import { PreferencesPage } from "./src/app/PreferencesPage" with { type: "ref" };
import { TaskDetailPage } from "./src/tasks/TaskDetailPage" with { type: "ref" };
import { getTask, getTasks, getTopTask, toggleTaskDone, updateTaskStatus, snoozeTask } from "./src/tasks/operations" with { type: "ref" };
import { getProjects } from "./src/projects/operations" with { type: "ref" };
import { createProject } from "./src/projects/operations" with { type: "ref" };
import { getGoals } from "./src/goals/operations" with { type: "ref" };
import { createGoal } from "./src/goals/operations" with { type: "ref" };
import { getLogbook } from "./src/logbook/operations" with { type: "ref" };
import { createInboxItem, getInboxItems, triageInboxItem } from "./src/inbox/operations" with { type: "ref" };
import { TodayPage } from "./src/lists/TodayPage" with { type: "ref" };
import { UpcomingPage } from "./src/lists/UpcomingPage" with { type: "ref" };
import { SomedayPage } from "./src/lists/SomedayPage" with { type: "ref" };
import { ProjectsPage } from "./src/projects/ProjectsPage" with { type: "ref" };
import { GoalsPage } from "./src/goals/GoalsPage" with { type: "ref" };
import { LogbookPage } from "./src/logbook/LogbookPage" with { type: "ref" };
import { ensureOnboarded, getAppData, setPreferredName } from "./src/onboarding/operations" with { type: "ref" };
import { getBillingStatus, createCheckoutSession } from "./src/billing/operations" with { type: "ref" };
import { stripeWebhook } from "./src/billing/webhook" with { type: "ref" };
import { stripeWebhookMiddleware } from "./src/billing/webhookMiddleware" with { type: "ref" };
import { EmailVerificationPage } from "./src/auth/email/EmailVerificationPage" with { type: "ref" };
import { LoginPage } from "./src/auth/email/LoginPage" with { type: "ref" };
import { PasswordResetPage } from "./src/auth/email/PasswordResetPage" with { type: "ref" };
import { RequestPasswordResetPage } from "./src/auth/email/RequestPasswordResetPage" with { type: "ref" };
import { SignupPage } from "./src/auth/email/SignupPage" with { type: "ref" };
import { userSignupFields } from "./src/auth/email/userSignupFields" with { type: "ref" };
import { LandingPage } from "./src/landing/LandingPage" with { type: "ref" };
import { OnboardingPage } from "./src/onboarding/OnboardingPage" with { type: "ref" };
import { DesignSystemPage } from "./src/components/design/DesignSystemPage" with { type: "ref" };
import { AboutPage } from "./src/public/AboutPage" with { type: "ref" };
import { PrivacyPage } from "./src/public/PrivacyPage" with { type: "ref" };
import { TermsPage } from "./src/public/TermsPage" with { type: "ref" };

export default app({
  name: "ActionAmp",
  title: "ActionAmp",
  wasp: { version: "^0.24.0" },
  head: [
    "<link rel='icon' type='image/svg+xml' href='/favicon.svg' />",
    "<link rel='icon' type='image/x-icon' href='/favicon.ico' />",
    "<link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />",
  ],
  auth: {
    userEntity: "User",
    methods: {
      email: {
        fromField: {
          name: "ActionAmp",
          email: "noreply@actionamp.com",
        },
        userSignupFields,
        emailVerification: {
          clientRoute: "EmailVerificationRoute",
        },
        passwordReset: {
          clientRoute: "PasswordResetRoute",
        },
      },
    },
    onAuthSucceededRedirectTo: "/app",
    onAuthFailedRedirectTo: "/login",
  },
  emailSender: {
    provider: "SMTP",
    defaultFrom: {
      name: "ActionAmp",
      email: "noreply@actionamp.com",
    },
  },
  client: {
    rootComponent: App,
  },
  spec: [
    route("LandingRoute", "/", page(LandingPage, { authRequired: false })),
    route("AppRoute", "/app", page(WhatNowPage)),
    route("InboxRoute", "/app/inbox", page(InboxPage)),
    route("InboxTriageRoute", "/app/inbox/review", page(InboxTriagePage)),
    route("TodayRoute", "/app/today", page(TodayPage)),
    route("UpcomingRoute", "/app/upcoming", page(UpcomingPage)),
    route("SomedayRoute", "/app/someday", page(SomedayPage)),
    route("ProjectsRoute", "/app/projects", page(ProjectsPage)),
    route("GoalsRoute", "/app/goals", page(GoalsPage)),
    route("LogbookRoute", "/app/logbook", page(LogbookPage)),
    route("SettingsRoute", "/app/settings", page(SettingsPage)),
    route("BillingRoute", "/app/settings/billing", page(BillingPage)),
    route(
      "PreferencesRoute",
      "/app/settings/preferences",
      page(PreferencesPage),
    ),
    route("TaskDetailRoute", "/app/tasks/:id", page(TaskDetailPage)),
    route("OnboardingRoute", "/welcome", page(OnboardingPage)),
    route("DesignSystemRoute", "/design-system", page(DesignSystemPage, { authRequired: false })),
    route("AboutRoute", "/about", page(AboutPage, { authRequired: false })),
    route(
      "PrivacyRoute",
      "/privacy",
      page(PrivacyPage, { authRequired: false }),
    ),
    route("TermsRoute", "/terms", page(TermsPage, { authRequired: false })),
    route("LoginRoute", "/login", page(LoginPage)),
    route("SignupRoute", "/signup", page(SignupPage)),
    route(
      "RequestPasswordResetRoute",
      "/request-password-reset",
      page(RequestPasswordResetPage),
    ),
    route("PasswordResetRoute", "/password-reset", page(PasswordResetPage)),
    route(
      "EmailVerificationRoute",
      "/email-verification",
      page(EmailVerificationPage),
    ),
    query(getTask, { entities: ["Task"], auth: true }),
    query(getTasks, { entities: ["Task"], auth: true }),
    query(getTopTask, { entities: ["Task"], auth: true }),
    action(toggleTaskDone, { entities: ["Task"], auth: true }),
    action(updateTaskStatus, { entities: ["Task"], auth: true }),
    action(snoozeTask, { entities: ["Task"], auth: true }),
    query(getProjects, { entities: ["Project", "Task"], auth: true }),
    action(createProject, { entities: ["Project"], auth: true }),
    query(getGoals, { entities: ["Goal", "Project", "Task"], auth: true }),
    action(createGoal, { entities: ["Goal"], auth: true }),
    query(getLogbook, { entities: ["Task", "Project"], auth: true }),
    query(getAppData, { entities: ["Lens", "InboxItem", "Task", "Project", "Goal"], auth: true }),
    action(ensureOnboarded, { entities: ["Lens"], auth: true }),
    action(setPreferredName, { entities: ["User"], auth: true }),
    query(getInboxItems, { entities: ["InboxItem"], auth: true }),
    action(createInboxItem, { entities: ["InboxItem"], auth: true }),
    action(triageInboxItem, { entities: ["InboxItem", "Task", "Project", "Resource"], auth: true }),
    query(getBillingStatus, { entities: ["Payment"], auth: true }),
    action(createCheckoutSession, { entities: ["User"], auth: true }),
    api("POST", "/webhooks/stripe", stripeWebhook, {
      entities: ["User", "Payment"],
      middlewareConfigFn: stripeWebhookMiddleware,
    }),
  ],
});
