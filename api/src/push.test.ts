// Unit tests for the daily-reminder pass (api/src/push.ts) — the loop
// the webapp left untested (its S14 notes: "port it behind a pure, testable
// seam"). All effects are injected; no web-push network, no DB.
import { describe, it, expect } from "vitest";

import {
  runDailyReminderPass,
  type ReminderDeps,
  type ReminderUserRow,
} from "./reminder.js";

const VAPID = { subject: "mailto:test@example.com", publicKey: "pk", privateKey: "priv" };

function sub(id: string): { id: string; endpoint: string; p256dh: string; auth: string } {
  return { id, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" };
}

function userRow(overrides: Partial<ReminderUserRow> = {}): ReminderUserRow {
  return {
    id: "u1",
    dailyReminderTime: "09:00",
    dailyReminderTimeZone: "UTC",
    lastDailyReminderAt: null,
    pushSubscriptions: [sub("s1")],
    ...overrides,
  };
}

interface World {
  users: ReminderUserRow[];
  claimed: string[];
  sends: { id: string; payload: string }[];
  failures: Map<string, { statusCode?: number }>;
  deleted: string[];
  tasks: { names: string[]; total: number };
  configured: number;
}

/** ReminderDeps over a scripted world, with the now fixed to 09:00 UTC. */
function makeDeps(world: World, now = new Date("2026-09-02T09:00:00.000Z")): ReminderDeps {
  return {
    vapid: () => VAPID,
    configureVapid: () => {
      world.configured += 1;
    },
    now: () => now,
    listReminderUsers: async () => world.users,
    todayTasks: async () => world.tasks,
    async send(s, payload) {
      world.sends.push({ id: s.id, payload });
      const failure = world.failures.get(s.id);
      if (failure) throw Object.assign(new Error("push failed"), failure);
    },
    deleteSubscription: async (id) => {
      world.deleted.push(id);
    },
    // Atomic claim: first caller for a user wins (the multi-worker race).
    async claimDailyReminder(userId) {
      if (world.claimed.includes(userId)) return false;
      world.claimed.push(userId);
      return true;
    },
  };
}

function makeWorld(users: ReminderUserRow[]): World {
  return {
    users,
    claimed: [],
    sends: [],
    failures: new Map(),
    deleted: [],
    tasks: { names: ["Write tests"], total: 1 },
    configured: 0,
  };
}

describe("runDailyReminderPass — VAPID gate", () => {
  it("no-ops with {sent: 0} when any VAPID key is missing", async () => {
    const world = makeWorld([userRow()]);
    const deps = makeDeps(world);
    deps.vapid = () => null;
    const { sent } = await runDailyReminderPass(deps);
    expect(sent).toBe(0);
    expect(world.sends).toEqual([]);
    expect(world.claimed).toEqual([]);
    expect(world.configured).toBe(0);
  });

  it("binds the credentials once per pass", async () => {
    const world = makeWorld([userRow()]);
    await runDailyReminderPass(makeDeps(world));
    expect(world.configured).toBe(1);
  });
});

describe("runDailyReminderPass — per-user gates", () => {
  it("sends the SW payload contract to every subscription at the saved time", async () => {
    const world = makeWorld([
      userRow({ pushSubscriptions: [sub("s1"), sub("s2")] }),
    ]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(2);
    expect(world.sends.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(JSON.parse(world.sends[0]!.payload)).toEqual({
      title: "ActionAmp",
      body: "Today: Write tests",
      url: "/do/today",
    });
  });

  it("skips users whose local time does not match", async () => {
    // 09:00 UTC now; the user is on 09:05.
    const world = makeWorld([userRow({ dailyReminderTime: "09:05" })]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(0);
    expect(world.claimed).toEqual([]);
  });

  it("matches the user's OWN zone (same instant, different local clocks)", async () => {
    // 2026-09-02T09:00Z is 11:00 in Paris — a Paris user set to 11:00 fires.
    const world = makeWorld([
      userRow({ dailyReminderTimeZone: "Europe/Paris", dailyReminderTime: "11:00" }),
    ]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(1);
  });

  it("skips an invalid IANA zone without crashing the run", async () => {
    const world = makeWorld([
      userRow({ dailyReminderTimeZone: "Not/AZone" }),
      userRow({ id: "u2" }),
    ]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(1); // u2 still fired
    expect(world.claimed).toEqual(["u2"]);
  });

  it("skips a user already stamped this LOCAL date", async () => {
    const world = makeWorld([
      userRow({ lastDailyReminderAt: new Date("2026-09-02T06:00:00.000Z") }),
    ]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(0);
    expect(world.claimed).toEqual([]);
  });

  it("fires when the stamp is from yesterday (once per local day)", async () => {
    const world = makeWorld([
      userRow({ lastDailyReminderAt: new Date("2026-09-01T09:00:00.000Z") }),
    ]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(1);
  });

  it("never claims (or stamps) a user with zero subscriptions", async () => {
    const world = makeWorld([userRow({ pushSubscriptions: [] })]);
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(0);
    expect(world.claimed).toEqual([]);
  });
});

describe("runDailyReminderPass — claim + prune semantics", () => {
  it("skips a user another worker already claimed (no double-send)", async () => {
    const world = makeWorld([userRow()]);
    const deps = makeDeps(world);
    deps.claimDailyReminder = async () => false; // lost the race
    const { sent } = await runDailyReminderPass(deps);
    expect(sent).toBe(0);
    expect(world.sends).toEqual([]);
  });

  it("a failed send still consumed the day (no retry loop) but does not count", async () => {
    const world = makeWorld([userRow()]);
    world.failures.set("s1", { statusCode: 500 });
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(0);
    expect(world.claimed).toEqual(["u1"]); // claimed BEFORE the attempt
    expect(world.deleted).toEqual([]); // 500 is not a prune
  });

  it("prunes only 404/410 dead endpoints", async () => {
    const world = makeWorld([
      userRow({ pushSubscriptions: [sub("dead1"), sub("dead2"), sub("alive")] }),
    ]);
    world.failures.set("dead1", { statusCode: 404 });
    world.failures.set("dead2", { statusCode: 410 });
    const { sent } = await runDailyReminderPass(makeDeps(world));
    expect(sent).toBe(1);
    expect(world.deleted).toEqual(["dead1", "dead2"]);
  });

  it("names the top tasks and appends (+N more) beyond the three-name sample", async () => {
    const world = makeWorld([userRow()]);
    world.tasks = { names: ["A", "B", "C"], total: 7 };
    await runDailyReminderPass(makeDeps(world));
    expect(JSON.parse(world.sends[0]!.payload).body).toBe("Today: A, B, C (+4 more)");
  });

  it("falls back to the calm empty nudge when Today has nothing", async () => {
    const world = makeWorld([userRow()]);
    world.tasks = { names: [], total: 0 };
    await runDailyReminderPass(makeDeps(world));
    expect(JSON.parse(world.sends[0]!.payload).body).toBe(
      "Nothing planned yet. Choose what matters.",
    );
  });
});
