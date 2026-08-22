-- Preserve both interpretations of the legacy overloaded Task.dueDate.
-- Calendar scheduling is derived in the user's IANA zone; exact deferral keeps
-- the original instant. The explicit new fields win if already populated.
UPDATE "Task" AS task
SET
  "scheduledDate" = COALESCE(
    task."scheduledDate",
    (
      (task."dueDate" AT TIME ZONE 'UTC') AT TIME ZONE
      COALESCE("User"."timeZone", "User"."dailyReminderTimeZone", 'UTC')
    )::date
  ),
  "snoozedUntil" = COALESCE(
    task."snoozedUntil",
    task."dueDate" AT TIME ZONE 'UTC'
  )
FROM "User"
WHERE
  task."userId" = "User"."id"
  AND task."dueDate" IS NOT NULL;

-- Inbox parsing used the same overloaded representation. Preserve both forms
-- so queued captures retain their meaning through the column transition.
UPDATE "InboxItem" AS item
SET
  "parsedScheduledDate" = COALESCE(
    item."parsedScheduledDate",
    (
      (item."parsedDate" AT TIME ZONE 'UTC') AT TIME ZONE
      COALESCE("User"."timeZone", "User"."dailyReminderTimeZone", 'UTC')
    )::date
  ),
  "parsedSnoozedUntil" = COALESCE(
    item."parsedSnoozedUntil",
    item."parsedDate" AT TIME ZONE 'UTC'
  )
FROM "User"
WHERE
  item."userId" = "User"."id"
  AND item."parsedDate" IS NOT NULL;
