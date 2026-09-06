import { describe, expect, it } from "vitest";
import {
  matchPaletteEntries,
  type SearchablePaletteEntry,
} from "./paletteMatching";

function entry(
  id: string,
  title: string,
  aliases: string[] = [],
  serverResult = false,
): SearchablePaletteEntry<string> {
  return {
    id,
    title,
    subtitle: "Open view",
    aliases,
    kindOrder: 1,
    serverResult,
    payload: id,
  };
}

describe("matchPaletteEntries", () => {
  it("orders exact, prefix, then Fuse fuzzy matches", () => {
    const results = matchPaletteEntries(
      [
        entry("fuzzy", "Projects"),
        entry("prefix", "Project archive"),
        entry("exact", "Project"),
      ],
      "project",
    );
    expect(results.map((result) => result.id)).toEqual([
      "exact",
      "prefix",
      "fuzzy",
    ]);
    expect(
      matchPaletteEntries([entry("projects", "Projects")], "projcts")[0].id,
    ).toBe("projects");
  });

  it("keeps server body matches and caps the viewport model", () => {
    const results = matchPaletteEntries(
      Array.from({ length: 40 }, (_, index) =>
        entry(`server-${index}`, `Unrelated ${index}`, [], true),
      ),
      "renewal",
    );
    expect(results).toHaveLength(30);
  });

  it("serializes and searches a 5k compact index within an interactive budget", () => {
    const entries = Array.from({ length: 5_000 }, (_, index) =>
      entry(`task-${index}`, `Task ${index}`, [
        "task",
        index % 2 ? "today" : "upcoming",
      ]),
    );
    const started = performance.now();
    const serialized = JSON.stringify(entries);
    const results = matchPaletteEntries(entries, "taks 4999");
    const elapsed = performance.now() - started;

    expect(serialized.length).toBeLessThan(1_000_000);
    expect(results[0]?.id).toBe("task-4999");
    expect(elapsed).toBeLessThan(1_000);
  });
});
