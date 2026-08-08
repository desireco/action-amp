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
      next: "/app",
      inbox: "/app/inbox",
      triage: "/app/inbox/review",
      today: "/app/today",
      upcoming: "/app/upcoming",
      someday: "/app/someday",
      projects: "/app/projects",
      goals: "/app/goals",
      logbook: "/app/logbook",
      review: "/app/review",
      settings: "/app/settings",
      billing: "/app/settings/billing",
    });
    expect(
      PALETTE_COMMANDS.filter((item) => item.action).map((item) => item.action),
    ).toEqual(["capture", "theme", "shortcuts"]);
    expect(PALETTE_COMMANDS.filter((item) => item.common)).toHaveLength(6);
  });
});
