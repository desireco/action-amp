import { action, api, app, page, query, route } from "@wasp.sh/spec";
import { App } from "./src/App" with { type: "ref" };
import { NextPage } from "./src/app/NextPage" with { type: "ref" };
import { FocusPage } from "./src/app/FocusPage" with { type: "ref" };
import { InboxPage } from "./src/inbox/InboxPage" with { type: "ref" };
import { TriagePage } from "./src/inbox/TriagePage" with { type: "ref" };
import { SettingsPage } from "./src/app/SettingsPage" with { type: "ref" };
import { BillingPage } from "./src/app/BillingPage" with { type: "ref" };
import { PreferencesPage } from "./src/app/PreferencesPage" with { type: "ref" };
import { LensesPage } from "./src/lenses/LensesPage" with { type: "ref" };
import { TaskDetailPage } from "./src/tasks/TaskDetailPage" with { type: "ref" };
import { getTask, getTasks, getDoneToday, getTopTask, getFocusedTask, toggleTaskDone, updateTaskStatus, snoozeTask, startTask, pauseTask, addTaskUpdate, updateTaskContent, updateTaskDetails, completeTaskFromFocus } from "./src/tasks/operations" with { type: "ref" };
import { getProjects } from "./src/projects/operations" with { type: "ref" };
import { createProject } from "./src/projects/operations" with { type: "ref" };
import { getProject, createTask } from "./src/projects/operations" with { type: "ref" };
import { setProjectDone, updateProject, deleteProject, updateTask } from "./src/projects/operations" with { type: "ref" };
import { ProjectDetailPage } from "./src/projects/ProjectDetailPage" with { type: "ref" };
import { getGoals, getGoal } from "./src/goals/operations" with { type: "ref" };
import { createGoal } from "./src/goals/operations" with { type: "ref" };
import { setGoalDone, updateGoal, deleteGoal, reorderGoalProjects } from "./src/goals/operations" with { type: "ref" };
import { getLogbook } from "./src/logbook/operations" with { type: "ref" };
import { createInboxItem, getInboxItems, triageInboxItem, restoreArchivedItem, getProjectsForResolver } from "./src/inbox/operations" with { type: "ref" };
import { TodayPage } from "./src/lists/TodayPage" with { type: "ref" };
import { UpcomingPage } from "./src/lists/UpcomingPage" with { type: "ref" };
import { SomedayPage } from "./src/lists/SomedayPage" with { type: "ref" };
import { ProjectsPage } from "./src/projects/ProjectsPage" with { type: "ref" };
import { GoalsPage } from "./src/goals/GoalsPage" with { type: "ref" };
import { GoalDetailPage } from "./src/goals/GoalDetailPage" with { type: "ref" };
import { LogbookPage } from "./src/logbook/LogbookPage" with { type: "ref" };
import { ensureOnboarded, setPreferredName, completeOnboarding } from "./src/onboarding/operations" with { type: "ref" };
import { createLens, updateLens, deleteLens } from "./src/lenses/operations" with { type: "ref" };
import { getLenses } from "./src/lenses/operations" with { type: "ref" };
import { getAppData } from "./src/app/operations" with { type: "ref" };
import { submitFeedback } from "./src/feedback/operations" with { type: "ref" };
import { getBillingStatus, createCheckoutSession, createCustomerPortalSession, getFounding100Status } from "./src/billing/operations" with { type: "ref" };
import { stripeWebhook } from "./src/billing/webhook" with { type: "ref" };
import { stripeWebhookMiddleware } from "./src/billing/webhookMiddleware" with { type: "ref" };
import { EmailVerificationPage } from "./src/auth/email/EmailVerificationPage" with { type: "ref" };
import { LoginPage } from "./src/auth/email/LoginPage" with { type: "ref" };
import { PasswordResetPage } from "./src/auth/email/PasswordResetPage" with { type: "ref" };
import { RequestPasswordResetPage } from "./src/auth/email/RequestPasswordResetPage" with { type: "ref" };
import { SignupPage } from "./src/auth/email/SignupPage" with { type: "ref" };
import { userSignupFields } from "./src/auth/email/userSignupFields" with { type: "ref" };
import { prepareDevAutologin } from "./src/auth/devAutologin" with { type: "ref" };
// Google social auth — disabled to skip GOOGLE_CLIENT_ID/SECRET setup for now.
// All supporting code (config, GoogleButton, userSignupFields) stays in place;
// flip the block below back on + re-add <GoogleButton /> to Login/Signup pages
// to re-enable. See docs/specs/social-auth-google.
// import { userSignupFields as googleUserSignupFields } from "./src/auth/google/userSignupFields" with { type: "ref" };
// import { getConfig as getGoogleConfig } from "./src/auth/google/config" with { type: "ref" };
import { LandingPage } from "./src/landing/LandingPage" with { type: "ref" };
import { OnboardingPage } from "./src/onboarding/OnboardingPage" with { type: "ref" };
import { DesignSystemPage } from "./src/components/design/DesignSystemPage" with { type: "ref" };
import { AboutPage } from "./src/public/AboutPage" with { type: "ref" };
import { Founding100Page } from "./src/public/Founding100Page" with { type: "ref" };
import { Founding100WelcomePage } from "./src/public/Founding100WelcomePage" with { type: "ref" };
import { PrivacyPage } from "./src/public/PrivacyPage" with { type: "ref" };
import { TermsPage } from "./src/public/TermsPage" with { type: "ref" };
import { RoadmapPage } from "./src/public/RoadmapPage" with { type: "ref" };

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
      // Google social auth — disabled (see imports note above).
      // google: {
      //   configFn: getGoogleConfig,
      //   userSignupFields: googleUserSignupFields,
      // },
    },
    onAuthSucceededRedirectTo: "/app",
    onAuthFailedRedirectTo: "/",
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
    route("AppRoute", "/app", page(NextPage)),
    route("FocusRoute", "/focus", page(FocusPage)),
    route("InboxRoute", "/app/inbox", page(InboxPage)),
    route("InboxTriageRoute", "/app/inbox/review", page(TriagePage)),
    route("TodayRoute", "/app/today", page(TodayPage)),
    route("TodayTaskRoute", "/app/today/:permalink", page(NextPage)),
    route("UpcomingRoute", "/app/upcoming", page(UpcomingPage)),
    route("SomedayRoute", "/app/someday", page(SomedayPage)),
    route("ProjectsRoute", "/app/projects", page(ProjectsPage)),
    route("GoalsRoute", "/app/goals", page(GoalsPage)),
    route("GoalDetailRoute", "/app/goals/:permalink", page(GoalDetailPage)),
    route("LogbookRoute", "/app/logbook", page(LogbookPage)),
    route("SettingsRoute", "/app/settings", page(SettingsPage)),
    route("BillingRoute", "/app/settings/billing", page(BillingPage)),
    route(
      "PreferencesRoute",
      "/app/settings/preferences",
      page(PreferencesPage),
    ),
    route("LensesRoute", "/app/settings/lenses", page(LensesPage)),
    route("TaskDetailRoute", "/app/tasks/:permalink", page(TaskDetailPage)),
    route("ProjectDetailRoute", "/app/projects/:permalink", page(ProjectDetailPage)),
    route("OnboardingRoute", "/welcome", page(OnboardingPage)),
    route("DesignSystemRoute", "/design-system", page(DesignSystemPage, { authRequired: false })),
    route("AboutRoute", "/about", page(AboutPage, { authRequired: false })),
    route("Founding100Route", "/founding-100", page(Founding100Page, { authRequired: false })),
    route("Founding100WelcomeRoute", "/founding-100/welcome", page(Founding100WelcomePage)),
    route(
      "PrivacyRoute",
      "/privacy",
      page(PrivacyPage, { authRequired: false }),
    ),
    route("TermsRoute", "/terms", page(TermsPage, { authRequired: false })),
    route("RoadmapRoute", "/roadmap", page(RoadmapPage, { authRequired: false })),
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
    action(prepareDevAutologin, { auth: false }),
    query(getTask, { entities: ["Task"], auth: true }),
    query(getTasks, { entities: ["Task", "Lens"], auth: true }),
    query(getDoneToday, { entities: ["Task", "Lens"], auth: true }),
    query(getTopTask, { entities: ["Task", "Lens"], auth: true }),
    query(getFocusedTask, { entities: ["Task"], auth: true }),
    action(toggleTaskDone, { entities: ["Task"], auth: true }),
    action(updateTaskStatus, { entities: ["Task"], auth: true }),
    action(snoozeTask, { entities: ["Task"], auth: true }),
    action(startTask, { entities: ["Task"], auth: true }),
    action(pauseTask, { entities: ["Task"], auth: true }),
    action(addTaskUpdate, { entities: ["Task", "TaskUpdate"], auth: true }),
    action(updateTaskContent, { entities: ["Task"], auth: true }),
    action(updateTaskDetails, { entities: ["Task"], auth: true }),
    action(completeTaskFromFocus, { entities: ["Task", "TaskUpdate"], auth: true }),
    query(getProjects, { entities: ["Project", "Task", "Lens"], auth: true }),
    action(createProject, { entities: ["Project", "Lens"], auth: true }),
    query(getProject, { entities: ["Project", "Task"], auth: true }),
    action(createTask, { entities: ["Task", "Project", "Goal", "Lens"], auth: true }),
    action(setProjectDone, { entities: ["Project", "Lens"], auth: true }),
    action(updateProject, { entities: ["Project", "Goal"], auth: true }),
    action(deleteProject, { entities: ["Project", "Task", "Resource"], auth: true }),
    action(updateTask, { entities: ["Task", "Project", "Goal"], auth: true }),
    query(getGoals, { entities: ["Goal", "Project", "Task", "Lens"], auth: true }),
    query(getGoal, { entities: ["Goal", "Project", "Task"], auth: true }),
    action(createGoal, { entities: ["Goal", "Lens"], auth: true }),
    action(setGoalDone, { entities: ["Goal", "Lens"], auth: true }),
    action(updateGoal, { entities: ["Goal"], auth: true }),
    action(deleteGoal, { entities: ["Goal", "Project", "Task", "Resource"], auth: true }),
    action(reorderGoalProjects, { entities: ["Goal", "Project"], auth: true }),
    query(getLogbook, { entities: ["Task", "Project", "Goal", "InboxItem"], auth: true }),
    query(getAppData, { entities: ["User", "Lens", "InboxItem", "Task", "Project", "Goal"], auth: true }),
    action(submitFeedback, { entities: ["User", "Feedback"], auth: true }),
    action(ensureOnboarded, { entities: ["Lens", "Project", "Task"], auth: true }),
    action(createLens, { entities: ["Lens"], auth: true }),
    action(updateLens, { entities: ["Lens"], auth: true }),
    action(deleteLens, { entities: ["Lens", "Task", "Project", "Goal"], auth: true }),
    query(getLenses, { entities: ["Lens"], auth: true }),
    action(setPreferredName, { entities: ["User"], auth: true }),
    action(completeOnboarding, { entities: ["User"], auth: true }),
    query(getInboxItems, { entities: ["InboxItem"], auth: true }),
    query(getProjectsForResolver, { entities: ["Project", "Lens"], auth: true }),
    action(createInboxItem, { entities: ["InboxItem", "Lens"], auth: true }),
    action(triageInboxItem, { entities: ["InboxItem", "Task", "Project", "Resource", "Tag", "Lens"], auth: true }),
    action(restoreArchivedItem, { entities: ["InboxItem"], auth: true }),
    query(getBillingStatus, { entities: ["Payment"], auth: true }),
    query(getFounding100Status, { entities: ["User"], auth: false }),
    action(createCheckoutSession, { entities: ["User"], auth: true }),
    action(createCustomerPortalSession, { entities: ["User"], auth: true }),
    api("POST", "/webhooks/stripe", stripeWebhook, {
      entities: ["User", "Payment"],
      middlewareConfigFn: stripeWebhookMiddleware,
    }),
  ],
});
