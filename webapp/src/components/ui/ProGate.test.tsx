import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { ProGate } from "./ProGate";
import { renderInContext } from "wasp/client/test";

/**
 * <ProGate> — the shared paywall-moment surface. The spec's load-bearing
 * principle: every limit renders through this one component, calm + specific,
 * with the same billing link. These tests pin the contract so the tone can't
 * drift as future gates reuse it.
 */

describe("ProGate — inline panel", () => {
  it("names the feature as a Pro feature", () => {
    renderInContext(
      <ProGate feature="a 4th project" reason="organize more than 3 projects with Pro" />,
    );
    expect(screen.getByText(/a 4th project/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro feature/i)).toBeInTheDocument();
  });

  it("shows the calm one-sentence reason", () => {
    renderInContext(
      <ProGate feature="the Work lens" reason="bring your work life into ActionAmp" />,
    );
    expect(screen.getByText(/bring your work life/i)).toBeInTheDocument();
  });

  it("links to billing (primary) and Founding 100 (secondary)", () => {
    renderInContext(
      <ProGate feature="a 2nd goal" reason="link work to more than one outcome with Pro" />,
    );
    expect(screen.getByRole("link", { name: /see plans/i })).toHaveAttribute(
      "href",
      "/do/settings/billing",
    );
    expect(screen.getByRole("link", { name: /founding 100/i })).toHaveAttribute(
      "href",
      "/founding-100",
    );
  });

  it("carries no manipulation/urgency copy (PRODUCT.md)", () => {
    const { container } = renderInContext(
      <ProGate feature="a 4th project" reason="organize more than 3 projects with Pro" />,
    );
    // No "limited time", "don't miss", exclamation marks, or red-dot class.
    expect(container.textContent).not.toMatch(/limited time|don't miss|urgent|now!/i);
    expect(container.querySelector(".aa-progate")).not.toHaveClass("aa-rose");
  });
});

describe("ProGate — trigger (at-cap create affordance)", () => {
  it("renders a link, not a dead button, pointing at billing", () => {
    renderInContext(
      <ProGate asTrigger feature="New project" reason="organize more than 3 projects with Pro">
        <span>New project</span>
      </ProGate>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/do/settings/billing");
    expect(link).toHaveClass("aa-progate-trigger");
  });
});
