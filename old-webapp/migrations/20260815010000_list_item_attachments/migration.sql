CREATE TABLE "ListItemAttachment" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "listItemId" TEXT NOT NULL,

  CONSTRAINT "ListItemAttachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ListItemAttachment"
  ADD CONSTRAINT "ListItemAttachment_listItemId_fkey"
  FOREIGN KEY ("listItemId") REFERENCES "ListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
