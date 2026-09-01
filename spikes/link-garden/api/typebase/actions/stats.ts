import { q } from "typebase-io/db";
import { z } from "zod";

import { links } from "../db/schema.ts";
import { authedAction } from "./custom-actions.ts";

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const today = authedAction
  .output(z.object({ captured: z.number().int().nonnegative(), kept: z.number().int().nonnegative() }))
  .handler(async ({ db, user }) => {
    const start = startOfToday();
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [capturedResult, keptResult] = await Promise.all([
      db
        .select({ count: q.count() })
        .from(links)
        .where(q.and(q.eq(links.userId, user.id), q.gte(links.createdAt, start), q.lt(links.createdAt, end))),
      db
        .select({ count: q.count() })
        .from(links)
        .where(
          q.and(
            q.eq(links.userId, user.id),
            q.eq(links.status, "KEPT"),
            q.gte(links.keptAt, start),
            q.lt(links.keptAt, end),
          ),
        ),
    ]);

    return {
      captured: Number(capturedResult.at(0)?.count ?? 0),
      kept: Number(keptResult.at(0)?.count ?? 0),
    };
  });
