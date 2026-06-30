import { describe, expect, it } from "vitest";
import { buildWelcomeEmail } from "./welcomeEmail";

describe("buildWelcomeEmail", () => {
  it("builds the onboarding welcome email with the chosen subject", () => {
    const email = buildWelcomeEmail(
      {
        firstName: "Jake",
        preferredName: "J",
        identities: { email: { id: "jake@example.com" }, google: null },
      },
      "https://actionamp.com",
    );

    expect(email).toEqual({
      to: "jake@example.com",
      subject: "Your first task is waiting",
      text: expect.stringContaining("Hi J,"),
      html: expect.stringContaining("Open ActionAmp"),
    });
    expect(email?.text).toContain("Start with one task, not a list.");
    expect(email?.text).toContain("https://actionamp.com/app");
  });

  it("returns null when no email-shaped auth identity is available", () => {
    const email = buildWelcomeEmail({
      firstName: "Jake",
      identities: { email: null, google: { id: "google-sub-id" } },
    });

    expect(email).toBeNull();
  });
});
