-- Project deadlines are calendar dates, never exact instants.
ALTER TABLE "Project"
ALTER COLUMN "dueDate" TYPE DATE
USING "dueDate"::date;
