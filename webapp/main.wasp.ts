import { app, page, route } from "@wasp.sh/spec";
import { App } from "./src/App" with { type: "ref" };
import { EmailVerificationPage } from "./src/auth/email/EmailVerificationPage" with { type: "ref" };
import { LoginPage } from "./src/auth/email/LoginPage" with { type: "ref" };
import { PasswordResetPage } from "./src/auth/email/PasswordResetPage" with { type: "ref" };
import { RequestPasswordResetPage } from "./src/auth/email/RequestPasswordResetPage" with { type: "ref" };
import { SignupPage } from "./src/auth/email/SignupPage" with { type: "ref" };
import { userSignupFields } from "./src/auth/email/userSignupFields" with { type: "ref" };
import { LandingPage } from "./src/landing/LandingPage" with { type: "ref" };
import { OnboardingPage } from "./src/onboarding/OnboardingPage" with { type: "ref" };
import { AboutPage } from "./src/public/AboutPage" with { type: "ref" };
import { PrivacyPage } from "./src/public/PrivacyPage" with { type: "ref" };
import { TermsPage } from "./src/public/TermsPage" with { type: "ref" };

export default app({
  name: "webapp",
  title: "webapp",
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
    onAuthSucceededRedirectTo: "/",
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
    route("OnboardingRoute", "/welcome", page(OnboardingPage)),
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
  ],
});
