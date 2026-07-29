import { action, api, app, job, page, query, route } from "@wasp.sh/spec";
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
import { getTask, getTasks, getTodayTasks, getDoneToday, getTopTask, getFocusedTask, toggleTaskDone, updateTaskStatus, unscheduleOverdueTasks, snoozeTask, startTask, pauseTask, addTaskUpdate, updateTaskContent, updateTaskDetails, setTaskOutcome, completeTaskFromFocus } from "./src/tasks/operations" with { type: "ref" };
import { getProjects } from "./src/projects/operations" with { type: "ref" };
import { createProject } from "./src/projects/operations" with { type: "ref" };
import { getProject, createTask } from "./src/projects/operations" with { type: "ref" };
import { setProjectDone, updateProject, deleteProject, updateTask } from "./src/projects/operations" with { type: "ref" };
import { createResource, updateResource, deleteResource } from "./src/resources/operations" with { type: "ref" };
import { ProjectDetailPage } from "./src/projects/ProjectDetailPage" with { type: "ref" };
import { getGoals, getGoal } from "./src/goals/operations" with { type: "ref" };
import { createGoal } from "./src/goals/operations" with { type: "ref" };
import { setGoalDone, updateGoal, deleteGoal, reorderGoalProjects } from "./src/goals/operations" with { type: "ref" };
import { getLogbook } from "./src/logbook/operations" with { type: "ref" };
import { createInboxItem, getInboxItem, getInboxItems, triageInboxItem, restoreArchivedItem, getProjectsForResolver } from "./src/inbox/operations" with { type: "ref" };
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
import { getAppData, updateProfile, saveTodayCap } from "./src/app/operations" with { type: "ref" };
import { getNotificationPreferences, saveDailyReminder, savePushSubscription } from "./src/notifications/operations" with { type: "ref" };
import { sendDailyTodayReminder } from "./src/notifications/dailyReminderJob" with { type: "ref" };
import { submitFeedback } from "./src/feedback/operations" with { type: "ref" };
import { getAdminStats, getRecentFeedback, updateFeedbackStatus, deleteFeedback } from "./src/admin/operations" with { type: "ref" };
import { getBillingStatus, createCheckoutSession, createCustomerPortalSession, getFounding100Status, founding100StatusHandler } from "./src/billing/operations" with { type: "ref" };
import { stripeWebhook } from "./src/billing/webhook" with { type: "ref" };
import { stripeWebhookMiddleware } from "./src/billing/webhookMiddleware" with { type: "ref" };
import { publicStatusMiddleware } from "./src/billing/statusMiddleware" with { type: "ref" };
// CLI auth (PAT plumbing) — issue/revoke/list + the /api/cli/* command surface.
// See docs/specs/cli-pat-plumbing.md.
import {
  patIssue,
  patRevoke,
  patList,
  cliNow,
  cliCapture,
  cliWhoami,
  cliTaskShow,
  cliTaskStart,
  cliTaskPause,
  cliTaskDone,
  cliTaskSnooze,
  cliTaskMove,
  cliToday,
  cliTodayDone,
  cliInboxList,
  cliInboxTriage,
  cliProjectList,
  cliProjectShow,
  cliProjectCreate,
  cliProjectAddTask,
  cliGoalList,
  cliGoalShow,
  cliGoalCreate,
  cliLensList,
  cliLensShow,
  cliLogbook,
  cliFeedbackList,
  cliFeedbackShow,
  cliFeedbackStatus,
  cliFeedbackDelete,
  cliAdminStats,
  cliAdminFeedback,
} from "./src/auth/patRoutes" with { type: "ref" };
import { mintCliToken } from "./src/auth/cliMint" with { type: "ref" };
import { patRouteMiddleware } from "./src/auth/patMiddleware" with { type: "ref" };
import { shareCapture } from "./src/share/shareCapture" with { type: "ref" };
import { shareRouteMiddleware } from "./src/share/shareRouteMiddleware" with { type: "ref" };
import { SharePage } from "./src/share/SharePage" with { type: "ref" };
import { PatSettingsPage } from "./src/app/PatSettingsPage" with { type: "ref" };
import { AdminPage } from "./src/admin/AdminPage" with { type: "ref" };
import { CliLoginPage } from "./src/auth/CliLoginPage" with { type: "ref" };
import { EmailVerificationPage } from "./src/auth/email/EmailVerificationPage" with { type: "ref" };
import { LoginPage } from "./src/auth/email/LoginPage" with { type: "ref" };
import { SignupPage } from "./src/auth/email/SignupPage" with { type: "ref" };
import { userSignupFields } from "./src/auth/email/userSignupFields" with { type: "ref" };
import { prepareDevAutologin } from "./src/auth/devAutologin" with { type: "ref" };
import { requestMagicLogin, verifyMagicLogin } from "./src/auth/magicLogin" with { type: "ref" };
import { globalMiddlewareConfigFn } from "./src/auth/serverMiddleware" with { type: "ref" };
// Google social auth — disabled to skip GOOGLE_CLIENT_ID/SECRET setup for now.
// All supporting code (config, GoogleButton, userSignupFields) stays in place;
// flip the block below back on + re-add <GoogleButton /> to Login/Signup pages
// to re-enable. See docs/specs/social-auth-google.
// import { userSignupFields as googleUserSignupFields } from "./src/auth/google/userSignupFields" with { type: "ref" };
// import { getConfig as getGoogleConfig } from "./src/auth/google/config" with { type: "ref" };
import { OnboardingPage } from "./src/onboarding/OnboardingPage" with { type: "ref" };
import { DesignSystemPage } from "./src/components/design/DesignSystemPage" with { type: "ref" };
import { Founding100Page } from "./src/public/Founding100Page" with { type: "ref" };
import { Founding100WelcomePage } from "./src/public/Founding100WelcomePage" with { type: "ref" };
// / on the app subdomain redirects to the marketing apex (Astro on Pages).
import { RedirectToMarketing } from "./src/public/RedirectToMarketing" with { type: "ref" };


export default app({
  name: "ActionAmp",
  title: "ActionAmp",
  wasp: { version: "^0.25.0" },
  head: [
    "<link rel='icon' type='image/svg+xml' href='/favicon.svg' />",
    "<link rel='icon' type='image/x-icon' href='/favicon.ico' />",
    "<link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />",
    // PWA: promote the home-screen icon to a real installed app so WebKit's
    // ITP 7-day cap on script-writable storage (localStorage) doesn't apply.
    // `display: standalone` in the manifest is the field that triggers the
    // exemption; these metas are the iOS-specific bridges to the same state.
    "<link rel='manifest' href='/manifest.json' />",
    "<meta name='apple-mobile-web-app-capable' content='yes' />",
    "<meta name='apple-mobile-web-app-status-bar-style' content='default' />",
    "<meta name='theme-color' content='#008AC0' />",
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
        // Wasp requires this config even though ActionAmp does not expose
        // password reset. A stale provider reset link lands on passwordless
        // login, where it cannot change a password.
        passwordReset: {
          clientRoute: "LoginRoute",
        },
      },
      // Google social auth — disabled (see imports note above).
      // google: {
      //   configFn: getGoogleConfig,
      //   userSignupFields: googleUserSignupFields,
      // },
    },
    onAuthSucceededRedirectTo: "/app",
    // Relative /login — stays on the app subdomain (app.actionamp.com/login).
    // Wasp's auth-required route guard redirects unauthenticated visitors here,
    // then returns them to the intended page after login. (Earlier this was the
    // absolute marketing apex, which wrongly sent auth-fails off the app.)
    onAuthFailedRedirectTo: "/login",
  },
  emailSender: {
    provider: "Resend",
    defaultFrom: {
      name: "ActionAmp",
      email: "noreply@actionamp.com",
    },
  },
  server: {
    // Adds the session-cookie fallback + sliding 30-day refresh. See
    // src/auth/sessionCookie.ts for the why (mobile PWA localStorage eviction).
    middlewareConfigFn: globalMiddlewareConfigFn,
  },
  client: {
    rootComponent: App,
  },
  spec: [
    route("LandingRoute", "/", page(RedirectToMarketing, { authRequired: false })),
    route("AppRoute", "/app", page(NextPage)),
    route("FocusRoute", "/app/focus", page(FocusPage)),
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
    route("PatSettingsRoute", "/app/settings/pat", page(PatSettingsPage)),
    route("AdminRoute", "/app/settings/admin", page(AdminPage)),
    route("TaskDetailRoute", "/app/tasks/:permalink", page(TaskDetailPage)),
    route("ProjectDetailRoute", "/app/projects/:permalink", page(ProjectDetailPage)),
    route("OnboardingRoute", "/welcome", page(OnboardingPage)),
    route("DesignSystemRoute", "/design-system", page(DesignSystemPage, { authRequired: false })),
    // Public: /founding-100 is a marketing/landing offer linked from PublicLayout
    // and ProGate aimed at logged-out visitors, so it must render for everyone.
    // The CTA handles auth itself — an anonymous clicker is sent to /login, an
    // authed clicker starts Stripe Checkout (createCheckoutSession gates on
    // context.user server-side). (authRequired defaults to false in Wasp 0.24 —
    // explicit for clarity.)
    route("Founding100Route", "/founding-100", page(Founding100Page, { authRequired: false })),
    route("Founding100WelcomeRoute", "/founding-100/welcome", page(Founding100WelcomePage)),
    // PWA share_target confirmation page. authRequired:false so it renders
    // during session resolution and after a logged-out → /login bounce (the
    // page handles its own auth awareness via useQuery). See
    // docs/superpowers/specs/2026-07-25-pwa-share-target-design.md.
    route("ShareRoute", "/share", page(SharePage, { authRequired: false })),
    route("LoginRoute", "/login", page(LoginPage)),
    // CLI OAuth login — the browser half of `actionamp login`. Session-authed
    // (authRequired: true → Wasp redirects to /login then back here with the
    // callback/state query params preserved). Explicit-consent confirm mints
    // an ApiKey and redirects to the CLI's localhost callback.
    route("CliLoginRoute", "/cli/login", page(CliLoginPage, { authRequired: true })),
    route("SignupRoute", "/signup", page(SignupPage)),
    route(
      "EmailVerificationRoute",
      "/email-verification",
      page(EmailVerificationPage),
    ),
    action(prepareDevAutologin, { auth: false }),
    action(requestMagicLogin, { entities: ["MagicLoginChallenge"], auth: false }),
    action(verifyMagicLogin, { entities: ["MagicLoginChallenge"], auth: false }),
    // CLI OAuth mint — the /cli/login page calls this to mint a PAT on confirm.
    // A Wasp action (not a custom api route) so it goes through /operations/*
    // where CORS+credentials are properly handled cross-origin.
    action(mintCliToken, { entities: ["ApiKey"], auth: true }),
    query(getTask, { entities: ["Task"], auth: true }),
    query(getTasks, { entities: ["Task", "Lens"], auth: true }),
    query(getTodayTasks, { entities: ["Task", "Lens"], auth: true }),
    query(getDoneToday, { entities: ["Task", "Lens"], auth: true }),
    query(getTopTask, { entities: ["Task", "Lens"], auth: true }),
    query(getFocusedTask, { entities: ["Task", "TaskSession"], auth: true }),
    action(toggleTaskDone, { entities: ["Task"], auth: true }),
    action(updateTaskStatus, { entities: ["Task"], auth: true }),
    action(unscheduleOverdueTasks, { entities: ["Task", "Lens"], auth: true }),
    action(snoozeTask, { entities: ["Task"], auth: true }),
    action(startTask, { entities: ["Task", "TaskSession"], auth: true }),
    action(pauseTask, { entities: ["Task", "TaskSession"], auth: true }),
    action(addTaskUpdate, { entities: ["Task", "TaskUpdate"], auth: true }),
    action(updateTaskContent, { entities: ["Task"], auth: true }),
    action(setTaskOutcome, { entities: ["Task"], auth: true }),
    action(updateTaskDetails, { entities: ["Task", "Project", "Goal"], auth: true }),
    action(completeTaskFromFocus, { entities: ["Task", "TaskUpdate", "TaskSession"], auth: true }),
    query(getProjects, { entities: ["Project", "Task", "Lens"], auth: true }),
    action(createProject, { entities: ["Project", "Lens"], auth: true }),
    query(getProject, { entities: ["Project", "Task", "Resource"], auth: true }),
    action(createTask, { entities: ["Task", "Project", "Goal", "Lens"], auth: true }),
    action(setProjectDone, { entities: ["Project", "Lens"], auth: true }),
    action(updateProject, { entities: ["Project", "Goal"], auth: true }),
    action(deleteProject, { entities: ["Project", "Task", "Resource"], auth: true }),
    action(updateTask, { entities: ["Task", "Project", "Goal"], auth: true }),
    action(createResource, { entities: ["Resource", "Project"], auth: true }),
    action(updateResource, { entities: ["Resource", "Project"], auth: true }),
    action(deleteResource, { entities: ["Resource", "Project"], auth: true }),
    query(getGoals, { entities: ["Goal", "Project", "Task", "Lens"], auth: true }),
    query(getGoal, { entities: ["Goal", "Project", "Task"], auth: true }),
    action(createGoal, { entities: ["Goal", "Lens"], auth: true }),
    action(setGoalDone, { entities: ["Goal", "Lens"], auth: true }),
    action(updateGoal, { entities: ["Goal"], auth: true }),
    action(deleteGoal, { entities: ["Goal", "Project", "Task", "Resource"], auth: true }),
    action(reorderGoalProjects, { entities: ["Goal", "Project"], auth: true }),
    query(getLogbook, { entities: ["Task", "Project", "Goal", "InboxItem"], auth: true }),
    query(getAppData, { entities: ["User", "Lens", "InboxItem", "Task", "Project", "Goal"], auth: true }),
    action(updateProfile, { entities: ["User"], auth: true }),
    action(saveTodayCap, { entities: ["User"], auth: true }),
    query(getNotificationPreferences, { entities: ["User"], auth: true }),
    action(savePushSubscription, { entities: ["PushSubscription"], auth: true }),
    action(saveDailyReminder, { entities: ["User"], auth: true }),
    action(submitFeedback, { entities: ["User", "Feedback"], auth: true }),
    query(getAdminStats, { entities: ["User", "Task", "Feedback"], auth: true }),
    query(getRecentFeedback, { entities: ["Feedback"], auth: true }),
    action(updateFeedbackStatus, { entities: ["Feedback"], auth: true }),
    action(deleteFeedback, { entities: ["Feedback"], auth: true }),
    action(ensureOnboarded, { entities: ["Lens", "Project", "Task"], auth: true }),
    action(createLens, { entities: ["Lens"], auth: true }),
    action(updateLens, { entities: ["Lens"], auth: true }),
    action(deleteLens, { entities: ["Lens", "Task", "Project", "Goal"], auth: true }),
    query(getLenses, { entities: ["Lens"], auth: true }),
    action(setPreferredName, { entities: ["User"], auth: true }),
    action(completeOnboarding, { entities: ["User"], auth: true }),
    query(getInboxItems, { entities: ["InboxItem", "InboxAttachment"], auth: true }),
    query(getInboxItem, { entities: ["InboxItem", "InboxAttachment"], auth: true }),
    query(getProjectsForResolver, { entities: ["Project", "Lens"], auth: true }),
    action(createInboxItem, { entities: ["InboxItem", "InboxAttachment", "Lens"], auth: true }),
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
    api("GET", "/founding-100/status", founding100StatusHandler, {
      entities: ["User"],
      auth: false,
      middlewareConfigFn: publicStatusMiddleware,
    }),
    // ── CLI auth (PAT plumbing) ────────────────────────────────────────────
    // The three session-authed token-management routes. `auth: true` (the
    // default) gates these to the logged-in user; `context.user.id` is the
    // tenancy key. CORS credentials (needed for the browser to send the
    // session cookie cross-origin) are handled globally in
    // `auth/serverMiddleware.ts` — a per-route middleware can't do it because
    // Express's method-specific routes don't match the OPTIONS preflight.
    // See src/auth/patRoutes.ts + docs/specs/cli-pat-plumbing.md.
    api("POST", "/api/pat/issue", patIssue, {
      entities: ["ApiKey"],
      auth: true,
    }),
    api("POST", "/api/pat/revoke", patRevoke, {
      entities: ["ApiKey"],
      auth: true,
    }),
    api("GET", "/api/pat/list", patList, {
      entities: ["ApiKey"],
      auth: true,
    }),
    // PWA share_target — form-urlencoded POST from the installed PWA's share
    // sheet (Android/Chrome). auth:true resolves context.user from the
    // wasp_session cookie. See docs/superpowers/specs/2026-07-25-pwa-share-target-design.md.
    api("POST", "/api/share", shareCapture, {
      entities: ["InboxItem", "Lens"],
      auth: true,
      middlewareConfigFn: shareRouteMiddleware,
    }),
    // The CLI stub: PAT-middleware protected (not session auth). `auth: false`
    // so Wasp doesn't add the session handler on top — the PAT middleware
    // resolves the user from the Bearer token. Replaced by the real CLI
    // surface in cli-package (Phase 1).
    //
    // ⚠ Every `/api/cli/*` route MUST set `middlewareConfigFn: patRouteMiddleware`.
    // Wasp has no path-prefix middleware grouping — forgetting it makes the
    // route silently unauthenticated (no session auth because `auth: false`,
    // no PAT auth because the middleware never runs). The e2e test in
    // `docs/reviews/cli-pat-plumbing.md` curls each `/api/cli/*` route
    // without a token and asserts 401; update it whenever a CLI route is added.
    api("GET", "/api/cli/now", cliNow, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // CLI quick-capture (prototype). Mirror of createInboxItem; Phase 1's
    // op refactor collapses the duplication.
    api("POST", "/api/cli/capture", cliCapture, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // CLI whoami — returns the resolved user (email/fullName/plan). Used by
    // the OAuth login flow's post-callback "Signed in as" line.
    api("GET", "/api/cli/whoami", cliWhoami, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // ── CLI command surface ───────────────────────────────────────────────
    // ⚠ Every `/api/cli/*` route MUST set `middlewareConfigFn: patRouteMiddleware`
    // (see the note above the now/capture stubs). Forgetting it makes the route
    // silently unauthenticated. Each handler below delegates to the pure
    // operation cores and translates entitlement violations (from the PURE
    // billing/entitlements helpers) into 402s — no wasp/server import lives in
    // the handlers.
    // Task routes.
    api("GET", "/api/cli/task/show", cliTaskShow, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/task/start", cliTaskStart, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/task/pause", cliTaskPause, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/task/done", cliTaskDone, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/task/snooze", cliTaskSnooze, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/task/move", cliTaskMove, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Today routes (global — no lens gate; the accessible-lens set is the filter).
    api("GET", "/api/cli/today", cliToday, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/today/done", cliTodayDone, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Inbox routes.
    api("GET", "/api/cli/inbox/list", cliInboxList, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/inbox/triage", cliInboxTriage, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Project routes.
    api("GET", "/api/cli/project/list", cliProjectList, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/project/show", cliProjectShow, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/project/create", cliProjectCreate, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/project/add-task", cliProjectAddTask, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Goal routes.
    api("GET", "/api/cli/goal/list", cliGoalList, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/goal/show", cliGoalShow, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/goal/create", cliGoalCreate, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Lens routes — list (all owned lenses w/ counts) + show (id-or-name).
    // No entitlement gate: listing + detail reads of owned lenses are always
    // allowed; gating fires on lens-scoped *use*, not on listing/show.
    api("GET", "/api/cli/lens/list", cliLensList, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/lens/show", cliLensShow, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Logbook route (optional ?lensId; defaults to the first accessible lens).
    api("GET", "/api/cli/logbook", cliLogbook, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    // Feedback triage routes — admin-only. The handlers gate on req.patUser.isAdmin
    // (first check, before any DB read) and return 403 for non-admins. Users still
    // submit feedback via the in-app action; only admins list/show/triage here.
    api("GET", "/api/cli/feedback/list", cliFeedbackList, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/feedback/show", cliFeedbackShow, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/feedback/status", cliFeedbackStatus, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("POST", "/api/cli/feedback/delete", cliFeedbackDelete, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/admin/stats", cliAdminStats, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    api("GET", "/api/cli/admin/feedback", cliAdminFeedback, {
      entities: [],
      auth: false,
      middlewareConfigFn: patRouteMiddleware,
    }),
    job(sendDailyTodayReminder, {
      executor: "PgBoss",
      entities: ["User", "PushSubscription", "Task"],
      // Per-minute so every valid local HH:mm choice can fire. The worker
      // sends at most once per user/calendar day (lastDailyReminderAt guard).
      schedule: { cron: "* * * * *" },
    }),
  ],
});
