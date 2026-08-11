/**
 * Tests for inbox, project, goal, logbook commands.
 * Unit-level: mocks request(). Same pattern as task/today tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-mgmt-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

const requestMock = vi.fn();
vi.mock("../api.js", () => ({
  request: (path: string, init?: unknown) => requestMock(path, init),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
      super(body.error ?? "error");
    }
  },
}));

let stdoutBuf = "";
let stderrBuf = "";
const origWrite = process.stdout.write.bind(process.stdout);
const origErrWrite = process.stderr.write.bind(process.stderr);
beforeEach(() => {
  stdoutBuf = "";
  stderrBuf = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutBuf += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderrBuf += chunk.toString();
    return true;
  };
});
afterEach(() => {
  process.stdout.write = origWrite;
  process.stderr.write = origErrWrite;
});

const { writeConfig, getConfigPath } = await import("../config.js");
const { makeInboxCommand } = await import("./inbox.js");
const { makeProjectCommand } = await import("./project.js");
const { makeGoalCommand } = await import("./goal.js");
const { makeLogbookCommand } = await import("./logbook.js");

async function run(cmd: { parseAsync: (a: string[], o: unknown) => Promise<void> }, args: string[]) {
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors
  }
  return { stdout: stdoutBuf, stderr: stderrBuf };
}

beforeEach(() => {
  mkdirSync(join(getConfigPath(), ".."), { recursive: true });
  writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
  requestMock.mockReset();
});
afterEach(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
});

describe("inbox list", () => {
  it("human output lists items", async () => {
    requestMock.mockResolvedValue({
      items: [
        { id: "i1", text: "fix the bug", status: "UNPROCESSED", createdAt: "2026-07-01T00:00:00.000Z" },
        { id: "i2", text: "call the lawyer", status: "UNPROCESSED", createdAt: "2026-07-02T00:00:00.000Z" },
      ],
    });
    const { stdout } = await run(makeInboxCommand(), ["list"]);
    expect(stdout).toContain("fix the bug");
    expect(stdout).toContain("call the lawyer");
  });

  it("empty → 'Inbox is empty.'", async () => {
    requestMock.mockResolvedValue({ items: [] });
    const { stdout } = await run(makeInboxCommand(), ["list"]);
    expect(stdout).toContain("Inbox is empty.");
  });

  it("--json emits the array", async () => {
    requestMock.mockResolvedValue({ items: [{ id: "i1", text: "test", status: "UNPROCESSED", createdAt: "x" }] });
    const { stdout } = await run(makeInboxCommand(), ["list", "--json"]);
    expect(JSON.parse(stdout).items).toHaveLength(1);
  });
});

describe("inbox triage", () => {
  it("posts the decision + echoes the kind", async () => {
    requestMock.mockResolvedValue({ kind: "task", id: "t1" });
    const { stdout } = await run(makeInboxCommand(), ["triage", "i1", "--decision", "task-today", "--lens-id", "l1"]);
    expect(stdout).toContain("Triaged to task.");
    expect(requestMock).toHaveBeenCalledWith("/api/cli/inbox/triage", {
      method: "POST",
      body: { inboxItemId: "i1", decision: "task-today", lensId: "l1" },
    });
  });

  it("supports a confirmed Simple-list destination", async () => {
    requestMock.mockResolvedValue({ kind: "list-item", id: "li1" });
    const { stdout } = await run(makeInboxCommand(), ["triage", "i1", "--decision", "list-item", "--lens-id", "shopping"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/inbox/triage", {
      method: "POST",
      body: { inboxItemId: "i1", decision: "list-item", lensId: "shopping" },
    });
    expect(stdout).toContain("Triaged to list-item.");
  });
});

describe("project list", () => {
  it("lists projects with counts", async () => {
    requestMock.mockResolvedValue({
      projects: [
        { id: "p1", name: "ProjectX", permalink: "projectx", isDone: false, taskCount: 3, resources: [{ id: "r1", title: "Launch brief", url: "https://example.com", notes: null }] },
        { id: "p2", name: "ProjectY", permalink: "projecty", isDone: true, taskCount: 0 },
      ],
    });
    const { stdout } = await run(makeProjectCommand(), ["list", "--lens-id", "l1"]);
    expect(stdout).toContain("ProjectX");
    expect(stdout).toContain("ProjectY");
    expect(stdout).toContain("Launch brief");
    expect(stdout).toContain("(done)");
  });
});

describe("project show", () => {
  it("shows the name + description", async () => {
    requestMock.mockResolvedValue({
      project: { id: "p1", name: "ProjectX", description: "The big one", isDone: false },
    });
    const { stdout } = await run(makeProjectCommand(), ["show", "p1"]);
    expect(stdout).toContain("ProjectX");
    expect(stdout).toContain("The big one");
  });

  it("null → 'No such project.'", async () => {
    requestMock.mockResolvedValue({ project: null });
    const { stdout } = await run(makeProjectCommand(), ["show", "nope"]);
    expect(stdout).toContain("No such project.");
  });
});

describe("project create", () => {
  it("posts name + lensId + description", async () => {
    requestMock.mockResolvedValue({ project: { id: "p1", name: "NewProj", isDone: false } });
    const { stdout } = await run(makeProjectCommand(), [
      "create", "NewProj", "--lens-id", "l1", "--description", "a project",
    ]);
    expect(stdout).toContain("Created project 'NewProj'.");
    expect(requestMock).toHaveBeenCalledWith("/api/cli/project/create", {
      method: "POST",
      body: { name: "NewProj", lensId: "l1", description: "a project" },
    });
  });
});

describe("project add-task", () => {
  it("posts the task description + lens", async () => {
    requestMock.mockResolvedValue({ task: { id: "t1", permalink: "new-task" } });
    const { stdout } = await run(makeProjectCommand(), [
      "add-task", "Write tests", "--lens-id", "l1", "--project-id", "p1",
    ]);
    expect(stdout).toContain("Added task 'Write tests'.");
    expect(requestMock).toHaveBeenCalledWith("/api/cli/project/add-task", {
      method: "POST",
      body: { description: "Write tests", lensId: "l1", projectId: "p1" },
    });
  });
});

describe("goal list", () => {
  it("lists goals", async () => {
    requestMock.mockResolvedValue({
      goals: [
        { id: "g1", name: "Run a 10k", isDone: false },
        { id: "g2", name: "Ship v1", isDone: true },
      ],
    });
    const { stdout } = await run(makeGoalCommand(), ["list", "--lens-id", "l1"]);
    expect(stdout).toContain("Run a 10k");
    expect(stdout).toContain("Ship v1");
    expect(stdout).toContain("(done)");
  });
});

describe("goal create", () => {
  it("posts name + lensId", async () => {
    requestMock.mockResolvedValue({ goal: { id: "g1", name: "New Goal", isDone: false } });
    const { stdout } = await run(makeGoalCommand(), ["create", "New Goal", "--lens-id", "l1"]);
    expect(stdout).toContain("Created goal 'New Goal'.");
  });
});

describe("logbook", () => {
  it("shows completed tasks with checkmarks", async () => {
    requestMock.mockResolvedValue({
      tasks: [
        {
          id: "t1",
          title: "Ship it",
          completedAt: "2026-07-26T00:00:00.000Z",
          outcome: null,
          size: "M",
          project: { id: "p1", name: "MVP" },
          goal: null,
          kind: "task",
        },
      ],
      projects: [],
      goals: [],
      archived: [],
    });
    const { stdout } = await run(makeLogbookCommand(), []);
    expect(stdout).toContain("Completed tasks (1):");
    expect(stdout).toContain("Ship it");
    // The parent context line (`· in ProjectName`) reads from the logbook's
    // `project.name`, not the Task-shaped `project` — guards against the
    // shape-regression this test was hiding.
    expect(stdout).toContain("in MVP");
  });

  it("shows finished projects + achieved goals with their titles", async () => {
    requestMock.mockResolvedValue({
      tasks: [],
      projects: [
        {
          id: "p1",
          title: "Launch v1",
          completedAt: "2026-07-26T00:00:00.000Z",
          project: null,
          goal: null,
          kind: "project",
        },
      ],
      goals: [
        {
          id: "g1",
          title: "Run a 10k",
          completedAt: "2026-07-26T00:00:00.000Z",
          project: null,
          goal: null,
          kind: "goal",
        },
      ],
      archived: [],
    });
    const { stdout } = await run(makeLogbookCommand(), []);
    expect(stdout).toContain("Finished projects (1):");
    expect(stdout).toContain("Launch v1");
    expect(stdout).toContain("Achieved goals (1):");
    expect(stdout).toContain("Run a 10k");
  });

  it("shows archived items", async () => {
    requestMock.mockResolvedValue({
      tasks: [],
      projects: [],
      goals: [],
      archived: [
        { id: "a1", title: "old idea", archivedAt: "2026-01-01T00:00:00.000Z", kind: "archived" },
      ],
    });
    const { stdout } = await run(makeLogbookCommand(), []);
    expect(stdout).toContain("Archived (1):");
    expect(stdout).toContain("old idea");
  });

  it("empty → 'Nothing in the logbook.'", async () => {
    requestMock.mockResolvedValue({ tasks: [], projects: [], goals: [], archived: [] });
    const { stdout } = await run(makeLogbookCommand(), []);
    expect(stdout).toContain("Nothing in the logbook.");
  });

  it("--lens-id passes the query param", async () => {
    requestMock.mockResolvedValue({ tasks: [], projects: [], goals: [], archived: [] });
    await run(makeLogbookCommand(), ["--lens-id", "l1"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/logbook?lensId=l1", undefined);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Active-lens fallback (set by `lens switch`) — `--lens-id` is now optional on
// the lens-scoped commands. Flag wins; else config; else a calm error.
// ───────────────────────────────────────────────────────────────────────────

describe("active-lens fallback", () => {
  it("project list uses config.lensId when no flag is passed", async () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001", lensId: "from-cfg" });
    requestMock.mockResolvedValue({ projects: [] });
    await run(makeProjectCommand(), ["list"]);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/project/list?lensId=from-cfg",
      undefined,
    );
  });

  it("project list: flag overrides config.lensId", async () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001", lensId: "from-cfg" });
    requestMock.mockResolvedValue({ projects: [] });
    await run(makeProjectCommand(), ["list", "--lens-id", "from-flag"]);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/project/list?lensId=from-flag",
      undefined,
    );
  });

  it("project list: no flag and no config → error, no request", async () => {
    const { stderr } = await run(makeProjectCommand(), ["list"]);
    expect(requestMock).not.toHaveBeenCalled();
    expect(stderr).toContain("lens-id required");
  });

  it("goal list uses config.lensId when no flag is passed", async () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001", lensId: "from-cfg" });
    requestMock.mockResolvedValue({ goals: [] });
    await run(makeGoalCommand(), ["list"]);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/goal/list?lensId=from-cfg",
      undefined,
    );
  });

  it("goal create uses config.lensId when no flag is passed", async () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001", lensId: "from-cfg" });
    requestMock.mockResolvedValue({ goal: { id: "g1", name: "G", isDone: false } });
    await run(makeGoalCommand(), ["create", "G"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/goal/create", {
      method: "POST",
      body: { name: "G", lensId: "from-cfg" },
    });
  });

  it("logbook uses config.lensId when no flag is passed", async () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001", lensId: "from-cfg" });
    requestMock.mockResolvedValue({ tasks: [], projects: [], goals: [], archived: [] });
    await run(makeLogbookCommand(), []);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/logbook?lensId=from-cfg",
      undefined,
    );
  });

  it("logbook: no flag and no config → global (no lensId in path)", async () => {
    requestMock.mockResolvedValue({ tasks: [], projects: [], goals: [], archived: [] });
    await run(makeLogbookCommand(), []);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/logbook", undefined);
  });

  it("inbox triage uses config.lensId when no flag is passed", async () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001", lensId: "from-cfg" });
    requestMock.mockResolvedValue({ kind: "task", id: "t1" });
    await run(makeInboxCommand(), ["triage", "i1", "--decision", "task-today"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/inbox/triage", {
      method: "POST",
      body: { inboxItemId: "i1", decision: "task-today", lensId: "from-cfg" },
    });
  });
});
