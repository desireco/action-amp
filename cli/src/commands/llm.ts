/**
 * llm — print instructions for LLMs / agents working with ActionAmp.
 *
 * Outputs a concise reference: the available commands, their --json shapes,
 * and the workflow patterns an agent should follow. Designed to be pasted
 * into a system prompt or @-mentioned file.
 */
import { Command } from "commander";

const INSTRUCTIONS = `# ActionAmp CLI — Agent Reference

You are working with ActionAmp, a focus app built around one principle: **one task, the next one that matters**. The CLI mirrors the web app's decision loop. Use it to read state and act on tasks.

## Core principle

ActionAmp is calm and opinionated. No streaks, no badges, no guilt-trip UI. When acting on a user's behalf: be direct, don't over-explain, and respect the "one thing at a time" philosophy.

## Commands

Every command supports \`--json\` for machine-readable output. Use \`--json\` when you need to parse the result programmatically.

### Read state

\`\`\`
actionamp now                  # the top task — what to do right now
actionamp today                # today's committed tasks
actionamp today --done         # what was completed today
actionamp task show <id>       # a single task (by id or permalink)
actionamp inbox list           # unprocessed inbox items
actionamp lens list            # available lenses
actionamp lens current         # locally active lens
actionamp project list --lens-id <id>   # projects in a lens
actionamp project show <id>    # a single project
actionamp resource list --project <id>  # project links and notes
actionamp goal list --lens-id <id>      # goals in a lens
actionamp goal show <id>       # a single goal
actionamp logbook              # completed tasks, finished projects/goals, archived
actionamp logbook --lens-id <id>        # scoped to one lens
actionamp review week                   # read-only weekly accomplishment report
actionamp review month --previous       # read-only previous-month overview
actionamp review month --lens-id <id>   # explicitly scoped report
actionamp whoami               # the logged-in account
\`\`\`

### Act

\`\`\`
actionamp task done <id> [--outcome "note"]   # mark a task complete
actionamp task start <id>                     # start a task (sets it as focused)
actionamp task pause <id>                     # pause the focused task
actionamp task snooze <id> [--preset <p>]     # snooze (1h|3h|tomorrow|weekend|someday)
actionamp task move <id> --to <list>          # move (today|upcoming|someday)
actionamp capture "<text>"                    # quick-capture to inbox
actionamp capture "<text>" --source-url <url> --file <image...>
                                                # capture shared reference/images
actionamp capture "<text>" --list-id <id>       # save directly to a Simple list
actionamp inbox triage <id> --decision <d>    # triage an inbox item
actionamp project create <name> --lens-id <id>           # create a project
actionamp project add-task "<desc>" --lens-id <id>       # add a task to a project
actionamp resource add <title> --project <id> [--url <url>] [--notes <text>]
actionamp resource update <id> [--title <text>] [--url <url>] [--notes <text>]
actionamp resource delete <id>
actionamp goal create <name> --lens-id <id>              # create a goal
\`\`\`

## JSON output shapes

\`\`\`
now          → { task: {...} | null, reason?: "no-lens" | "no-candidates" }
today        → { tasks: [...] }
today --done → { tasks: [...] }
task show    → { task: {...} | null }
task done    → { task: {...} }           # the updated task
task start   → { id, startedAt }
task pause   → { id, startedAt: null }
task snooze  → { id, status, dueDate }
task move    → { task: {...} }
inbox list   → { items: [...] }
resource list → { projectId, resources: [...] }
resource add/update → { resource: {...} }
resource delete → { id }
project list → { projects: [...] }
project show → { project: {...} | null }
goal list    → { goals: [...] }
goal show    → { goal: {...} | null }
logbook      → { tasks: [...], projects: [...], goals: [...], archived: [...] }
review week/month → { report: { state, period, totals, actionsByLens, highlights, tasks, projects, goals, weeklySlices, checkIn, reflection, emphasisGoal } }
whoami       → { user: { id, email, fullName, plan } }
capture      → { ok: true, id, text, createdAt }
\`\`\`

Errors: \`{ error: "<message>" }\` to stdout, exit code 1.

## Task fields (in JSON output)

\`\`\`
id, description, permalink, content (context notes), outcome (completion note),
isDone, createdAt, completedAt, startedAt (non-null = in progress / "Now"),
priority (LOW | NORMAL | IMPORTANT), size (S | M | L | XL),
status (SOMEDAY | UPCOMING | TODAY), dueDate,
projectId, goalId, lensId,
project { id, name }, goal { id, name }
\`\`\`

## Shared captures and resources

- \`capture\` accepts optional \`--title\`, \`--content\`, \`--source-url\`,
  \`--project-id\`, and \`--list-id\` (the last saves directly to a Simple list).
- \`--file <path...>\` attaches up to four JPEG, PNG, GIF, WebP, HEIC, or HEIF
  images, up to 5 MB each. Inbox list returns attachment metadata, not binary image data.
- Resources are project-owned links and notes, never file uploads. Use
  \`resource list\` before changing or deleting one. A resource's \`--project\`
  value is its project ID; \`resource list\` also accepts a project permalink.

## Workflow patterns

### "What should I work on?"
1. \`actionamp now\` — the top task. If it returns a task, that's the answer.
2. If \`now\` returns \`{ task: null, reason: "no-candidates" }\`, nothing is on the table. Suggest capturing or checking Today.

### Complete a task and see what's next
1. \`actionamp task done <id>\`
2. \`actionamp now\` — the next task surfaces automatically.

### Review the day
1. \`actionamp today\` — what's committed.
2. \`actionamp today --done\` — what's finished.
3. \`actionamp logbook\` — the full history (completed tasks, finished projects/goals, archived).

### Review the week or month
1. \`actionamp review week --json\` or \`actionamp review month --json\`.
2. Ground the overview in completed Goals, Projects, significant L/M actions,
   counts by Lens, focus time, and the user's saved responses.
3. When \`state\` is \`in_progress\`, report momentum so far, what is going well,
   challenges, and remaining attention. Use present tense; do not pronounce a
   final verdict. When \`state\` is \`finished\`, report accomplishments, lessons,
   and carry-forward using retrospective language.
4. Summarize evidence. Do not invent comparisons, scores, or productivity
   judgments. Review commands are read-only and cannot close a period.

### Capture a thought
\`actionamp capture "fix the pagination bug #backend !important"\`
NL parsing extracts: \`#project\`, \`@date\`, \`!priority\`, \`#tags\`, \`[[lens]]\`.

### Inbox triage
1. \`actionamp inbox list\` — see unprocessed items.
2. \`actionamp inbox triage <id> --decision task-today --lens-id <id>\` — file it.
   Decisions: \`task-today\`, \`upcoming\`, \`someday\`, \`project\`,
   \`resource\`, \`list-item\`, \`archive\`, \`delete\`. Use \`list-item\`
   only with a Simple-list Lens; it creates a flat checklist row without task metadata.

## Rules for agents

- **Decide, then act.** Don't bulk-mutuate. Propose a plan, get confirmation, then execute one action at a time.
- **Read before writing.** Always \`now\` or \`task show\` before \`task done\` — confirm the task exists and is the right one.
- **Respect Today's cap.** Today holds at most 5 items. Don't move more than 5 to Today without surfacing the cap.
- **Lenses scope everything.** Most reads take \`--lens-id\`. If you don't know the lens, use \`now\` (resolves the default) or check the user's lenses in the web app.
- **No autonomous triage.** Triage transforms inbox items into tasks, projects, resources, or list items — always confirm the decision with the user first.
- **Review is read-only.** Agents may report and summarize review evidence, but cannot write reflection answers or close Today.
`;

export function makeLlmCommand(): Command {
  const cmd = new Command("llm");
  cmd
    .description("print instructions for LLMs / agents working with ActionAmp")
    .option("--json", "emit the instructions as a JSON string")
    .action((opts: { json?: boolean }) => {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify({ instructions: INSTRUCTIONS }) + "\n",
        );
      } else {
        process.stdout.write(INSTRUCTIONS);
      }
    });
  return cmd;
}
