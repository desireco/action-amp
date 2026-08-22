-- The preceding backfill migration copied every non-null legacy value into
-- both explicit fields before these overloaded compatibility columns go away.
ALTER TABLE "Task" DROP COLUMN "dueDate";
ALTER TABLE "InboxItem" DROP COLUMN "parsedDate";
