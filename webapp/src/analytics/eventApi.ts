import type { Request, Response } from "express";
import { recordAnalyticsEventCore, type AnalyticsEventInput } from "./operationsCore";

type ApiContext = { user?: { id: string } | null; entities: Record<string, unknown> };

function bodyInput(body: unknown): AnalyticsEventInput | null {
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || typeof b.visitorId !== "string") return null;
  return b as unknown as AnalyticsEventInput;
}

/** Public marketing/app bridge. It records no PII and never returns event data. */
export async function recordAnalyticsEventApi(req: Request, res: Response, context: ApiContext) {
  const input = bodyInput(req.body);
  if (!input) return res.status(400).json({ error: "Invalid analytics event." });
  try {
    await recordAnalyticsEventCore(context.entities, input, context.user?.id ?? null);
    return res.status(204).end();
  } catch (error) {
    console.warn("[analytics] event rejected", error instanceof Error ? error.message : error);
    return res.status(400).json({ error: "Invalid analytics event." });
  }
}
