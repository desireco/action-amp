import { describe, expect, it } from "vitest";
import { buildWelcomeEmail } from "./welcomeEmail";

describe("buildWelcomeEmail", () => {
  it("builds the onboarding welcome email with the chosen subject", async () => {
    const email = await buildWelcomeEmail(
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
    expect(email?.text).toContain("https://actionamp.com/do");
    expect(email?.html).toContain("ActionAmp");
    expect(email?.html).toContain("Your first task is waiting");
  });

  it("returns null when no email-shaped auth identity is available", async () => {
    const email = await buildWelcomeEmail({
      firstName: "Jake",
      identities: { email: null, google: { id: "google-sub-id" } },
    });

    expect(email).toBeNull();
  });
});
