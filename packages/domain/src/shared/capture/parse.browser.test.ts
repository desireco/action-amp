/**
 * The browser-binding run (#15): clear the platform Temporal global, let
 * temporal.browser.ts install its mini namespace, then import the parser —
 * the domain's temporal.ts binds whatever global it finds, so this file
 * proves the shim satisfies the ENTIRE parser graph, the exact class of
 * drift a dual-binding architecture could silently introduce.
 *
 * Top-level awaits are the load-bearing order: the clear must land before
 * temporal.browser.js evaluates, and its namespace before temporal.js does.
 * The afterAll restore keeps the mini namespace from leaking into other
 * suite files sharing this worker (vitest isolates module registries per
 * file, not globals).
 */
import { afterAll } from "vitest";
import { parserSuite } from "./parse.suite.js";

const savedTemporal = (globalThis as { Temporal?: unknown }).Temporal;
(globalThis as { Temporal?: unknown }).Temporal = undefined;

await import("../time/temporal.browser.js"); // installs the mini namespace
const { parseCapture } = await import("./parse.js"); // binds it

afterAll(() => {
  (globalThis as { Temporal?: unknown }).Temporal = savedTemporal;
});

parserSuite(parseCapture);
