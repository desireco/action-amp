import { describe, expect, it } from "vitest";
import { Text } from "react-email";
import { renderFeedbackEmailHtml } from "./FeedbackEmail";
import {
  renderTransactionalEmailHtml,
  transactionalEmailTextStyle,
} from "./TransactionalEmail";

describe("transactional email templates", () => {
  it("renders the shared ActionAmp layout", async () => {
    const html = await renderTransactionalEmailHtml({
      title: "Check your email",
      preview: "One quiet account step.",
      cta: { label: "Open ActionAmp", href: "https://actionamp.com/app" },
      children: <Text style={transactionalEmailTextStyle}>Body copy.</Text>,
    });

    expect(html).toContain("ActionAmp");
    expect(html).toContain("Check your email");
    expect(html).toContain("Open ActionAmp");
    expect(html).toContain("One task. Then the next.");
  });

  it("escapes feedback details while preserving message lines", async () => {
    const html = await renderFeedbackEmailHtml({
      id: "feedback-1",
      message: "<script>alert(1)</script>\nSecond line",
      route: "/app",
      section: "work",
      lensName: "Work",
      lensColor: "indigo",
      userName: "A <B>",
      userEmail: "a@example.com",
      userAgent: "Vitest",
    });

    expect(html).toContain("New ActionAmp feedback");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Second line");
    expect(html).toContain("A &lt;B&gt;");
  });
});
