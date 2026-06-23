#!/usr/bin/env node
/**
 * ActionAmp — move a user's Tasks back to the Inbox as unprocessed InboxItems.
 *
 * Reverses triage: each Task becomes a fresh InboxItem (text = description,
 * parsed-* fields carried so re-triage keeps the priority/size/date guesses),
 * then the Task is deleted. Idempotent per task (uses task id in the new
 * InboxItem id is NOT forced — re-running would double up; the task is gone
 * after the first run so it's safe in practice).
 *
 * USAGE:
 *   node scripts/tasks-to-inbox.mjs --email zeljko@dakic.com
 *   node scripts/tasks-to-inbox.mjs --email a@b.c --dry-run
 *
 * ponytail: does not touch tasks that are already done (completedAt set) —
 * those are Logbook history, not re-triage candidates. Override with --all.
 */
import { PrismaClient } from "@prisma/client";

const argv = process.argv.slice(2);
const get = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const email = get("--email");
const dryRun = argv.includes("--dry-run");
const includeDone = argv.includes("--all");
if (!email) {
  console.error("Usage: node scripts/tasks-to-inbox.mjs --email X [--dry-run] [--all]");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const user = await db.user.findFirst({
    where: { auth: { identities: { some: { providerName: "email", providerUserId: email } } } },
    select: { id: true },
  });
  if (!user) {
    console.error(`✗ No user for ${email}`);
    process.exit(2);
  }

  const where = { userId: user.id, ...(includeDone ? {} : { isDone: false }) };
  const tasks = await db.task.findMany({ where, select: { id: true, description: true, priority: true, size: true, dueDate: true } });
  console.log(`Found ${tasks.length} task(s) for ${email}${dryRun ? " (dry run)" : ""}.`);

  if (dryRun) {
    for (const t of tasks) console.log(`  would move: "${t.description}"`);
    process.exit(0);
  }

  // One transaction: create the InboxItems, then delete the tasks.
  await db.$transaction([
    ...tasks.map((t) =>
      db.inboxItem.create({
        data: {
          text: t.description,
          userId: user.id,
          status: "UNPROCESSED",
          parsedPriority: t.priority,
          parsedSize: t.size,
          parsedDate: t.dueDate,
        },
      }),
    ),
    db.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } }),
  ]);

  console.log(`✓ Moved ${tasks.length} task(s) → inbox for ${email}`);
} finally {
  await db.$disconnect();
}
