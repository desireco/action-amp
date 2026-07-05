-- Add stable human-readable route keys for Task detail pages.
-- Backfill from descriptions, suffixing collisions per user.

ALTER TABLE "Task" ADD COLUMN "permalink" TEXT;

WITH task_slugs AS (
  SELECT
    "Task".id,
    COALESCE(
      NULLIF(
        SUBSTRING(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              LOWER(
                CASE
                  WHEN "Project"."permalink" IS NOT NULL
                    THEN "Project"."permalink" || '-' || "Task".description
                  ELSE "Task".description
                END
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '(^-|-$)',
            '',
            'g'
          )
          FROM 1 FOR 72
        ),
        ''
      ),
      'task'
    ) AS base,
    ROW_NUMBER() OVER (
      PARTITION BY
        "Task"."userId",
        COALESCE(
          NULLIF(
            SUBSTRING(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  LOWER(
                    CASE
                      WHEN "Project"."permalink" IS NOT NULL
                        THEN "Project"."permalink" || '-' || "Task".description
                      ELSE "Task".description
                    END
                  ),
                  '[^a-z0-9]+',
                  '-',
                  'g'
                ),
                '(^-|-$)',
                '',
                'g'
              )
              FROM 1 FOR 72
            ),
            ''
          ),
          'task'
        )
      ORDER BY "Task"."createdAt", "Task".id
    ) AS n
  FROM "Task"
  LEFT JOIN "Project" ON "Project".id = "Task"."projectId"
)
UPDATE "Task"
SET "permalink" = CASE
  WHEN task_slugs.n = 1 THEN task_slugs.base
  ELSE task_slugs.base || '-' || task_slugs.n
END
FROM task_slugs
WHERE "Task".id = task_slugs.id;

ALTER TABLE "Task" ALTER COLUMN "permalink" SET NOT NULL;

CREATE UNIQUE INDEX "Task_userId_permalink_key" ON "Task"("userId", "permalink");
