-- Add stable human-readable route keys for Goal and Project detail pages.
-- Backfill from names, suffixing collisions per user.

ALTER TABLE "Goal" ADD COLUMN "permalink" TEXT;
ALTER TABLE "Project" ADD COLUMN "permalink" TEXT;

WITH goal_slugs AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        SUBSTRING(
          REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'),
            '(^-|-$)',
            '',
            'g'
          )
          FROM 1 FOR 72
        ),
        ''
      ),
      'goal'
    ) AS base,
    ROW_NUMBER() OVER (
      PARTITION BY
        "userId",
        COALESCE(
          NULLIF(
            SUBSTRING(
              REGEXP_REPLACE(
                REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'),
                '(^-|-$)',
                '',
                'g'
              )
              FROM 1 FOR 72
            ),
            ''
          ),
          'goal'
        )
      ORDER BY "createdAt", id
    ) AS n
  FROM "Goal"
)
UPDATE "Goal"
SET "permalink" = CASE
  WHEN goal_slugs.n = 1 THEN goal_slugs.base
  ELSE goal_slugs.base || '-' || goal_slugs.n
END
FROM goal_slugs
WHERE "Goal".id = goal_slugs.id;

WITH project_slugs AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        SUBSTRING(
          REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'),
            '(^-|-$)',
            '',
            'g'
          )
          FROM 1 FOR 72
        ),
        ''
      ),
      'project'
    ) AS base,
    ROW_NUMBER() OVER (
      PARTITION BY
        "userId",
        COALESCE(
          NULLIF(
            SUBSTRING(
              REGEXP_REPLACE(
                REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'),
                '(^-|-$)',
                '',
                'g'
              )
              FROM 1 FOR 72
            ),
            ''
          ),
          'project'
        )
      ORDER BY "createdAt", id
    ) AS n
  FROM "Project"
)
UPDATE "Project"
SET "permalink" = CASE
  WHEN project_slugs.n = 1 THEN project_slugs.base
  ELSE project_slugs.base || '-' || project_slugs.n
END
FROM project_slugs
WHERE "Project".id = project_slugs.id;

ALTER TABLE "Goal" ALTER COLUMN "permalink" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "permalink" SET NOT NULL;

CREATE UNIQUE INDEX "Goal_userId_permalink_key" ON "Goal"("userId", "permalink");
CREATE UNIQUE INDEX "Project_userId_permalink_key" ON "Project"("userId", "permalink");
