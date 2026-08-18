import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Linkify, linkifySegments } from "./Linkify";

describe("linkifySegments", () => {
  it("returns URL-free text as one text segment", () => {
    expect(linkifySegments("Email Sarah about the invoice")).toEqual([
      { kind: "text", value: "Email Sarah about the invoice" },
    ]);
  });

  it("extracts an https URL with the text around it", () => {
    expect(linkifySegments("Read https://example.com/guide first")).toEqual([
      { kind: "text", value: "Read " },
      { kind: "url", value: "https://example.com/guide", href: "https://example.com/guide" },
      { kind: "text", value: " first" },
    ]);
  });

  it("adds the https scheme to bare www hosts", () => {
    expect(linkifySegments("see www.foo.dev now")).toEqual([
      { kind: "text", value: "see " },
      { kind: "url", value: "www.foo.dev", href: "https://www.foo.dev" },
      { kind: "text", value: " now" },
    ]);
  });

  it("keeps trailing sentence punctuation out of the URL", () => {
    expect(linkifySegments("Go to https://example.com/a, then stop.")).toEqual([
      { kind: "text", value: "Go to " },
      { kind: "url", value: "https://example.com/a", href: "https://example.com/a" },
      { kind: "text", value: ", then stop." },
    ]);
  });

  it("keeps paired brackets and drops unpaired ones", () => {
    expect(linkifySegments("(https://example.com/x) and https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      { kind: "text", value: "(" },
      { kind: "url", value: "https://example.com/x", href: "https://example.com/x" },
      { kind: "text", value: ") and " },
      { kind: "url", value: "https://en.wikipedia.org/wiki/Foo_(bar)", href: "https://en.wikipedia.org/wiki/Foo_(bar)" },
    ]);
  });

  it("leaves bare domains and malformed URLs as plain text", () => {
    expect(linkifySegments("example.com and https://")).toEqual([
      { kind: "text", value: "example.com and https://" },
    ]);
  });
});

describe("Linkify", () => {
  it("renders URL-free text without any anchor", () => {
    render(<p>
      <Linkify text="Just a thought, no link" />
    </p>);

    expect(screen.getByText("Just a thought, no link")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders URLs as new-tab links with noopener hardening", () => {
    render(<p>
      <Linkify text="Read https://example.com/guide and www.foo.dev." />
    </p>);

    const first = screen.getByRole("link", { name: "https://example.com/guide" });
    expect(first).toHaveAttribute("href", "https://example.com/guide");
    expect(first).toHaveAttribute("target", "_blank");
    expect(first).toHaveAttribute("rel", "noopener noreferrer");

    const second = screen.getByRole("link", { name: "www.foo.dev" });
    expect(second).toHaveAttribute("href", "https://www.foo.dev");
  });

  it("linkifies when the whole text is a single URL", () => {
    render(<p>
      <Linkify text="https://example.com/" />
    </p>);

    const link = screen.getByRole("link", { name: "https://example.com/" });
    expect(link).toHaveAttribute("href", "https://example.com/");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
