-- Feedback.shortId — human-addressable 8-char Crockford base32 id (XXXX-XXXX).
--
-- Required + unique. Existing rows get a generated distinct value before the
-- NOT NULL + UNIQUE constraints land. New rows get shortId from the app layer
-- (webapp/src/shared/shortId.ts → uniqueShortId); there is no DB default
-- because Postgres can't easily call back into a collision-retry generator.
--
-- The backfill generates a random Crockford-base32 string per row. With one
-- existing row a collision is impossible; the retry loop lives in app code for
-- the general case.

-- Add the column nullable first so the backfill can populate it.
ALTER TABLE "Feedback" ADD COLUMN "shortId" TEXT;

-- Backfill: generate `XXXX-XXXX` from the Crockford alphabet for each row.
-- A DO block + loop ensures each row gets a distinct value (collision-retry
-- against the rows updated so far this run).
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXZ';
  i INT;
BEGIN
  FOR r IN SELECT id FROM "Feedback" WHERE "shortId" IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
      END LOOP;
      candidate := substr(candidate, 1, 4) || '-' || substr(candidate, 5, 4);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Feedback" WHERE "shortId" = candidate);
    END LOOP;
    UPDATE "Feedback" SET "shortId" = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Now make it required + unique.
ALTER TABLE "Feedback" ALTER COLUMN "shortId" SET NOT NULL;
CREATE UNIQUE INDEX "Feedback_shortId_key" ON "Feedback"("shortId");
