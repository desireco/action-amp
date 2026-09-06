import { describe, expect, it } from "vitest";
import { PALETTE_COMMANDS } from "./paletteRegistry";

describe("palette command registry", () => {
  it("owns every required destination and shared action", () => {
    const routes = Object.fromEntries(
      PALETTE_COMMANDS.filter((item) => item.href).map((item) => [
        item.id,
        item.href,
      ]),
    );
    expect(routes).toMatchObject({
      next: "/do",
      inbox: "/do/inbox",
      triage: "/do/inbox/review",
      today: "/do/today",
      upcoming: "/do/upcoming",
      someday: "/do/someday",
      projects: "/do/projects",
      goals: "/do/goals",
      logbook: "/do/logbook",
      review: "/do/review",
      settings: "/do/settings",
      billing: "/do/settings/billing",
    });
    expect(
      PALETTE_COMMANDS.filter((item) => item.action).map((item) => item.action),
    ).toEqual(["capture", "theme", "shortcuts"]);
    expect(PALETTE_COMMANDS.filter((item) => item.common)).toHaveLength(6);
  });
});
