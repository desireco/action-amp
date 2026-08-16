import type { Request, Response } from "express";
import {
  ANALYTICS_EVENTS,
  recordAnalyticsEventCore,
  type AnalyticsEventInput,
  type AnalyticsEventName,
} from "./operationsCore";
import {
  isJsonBoolean,
  isJsonNumber,
  isJsonString,
  type JsonValue,
} from "../shared/jsonValue";

/** The analytics-delegate slice recordAnalyticsEventCore touches (mirrors the
 *  calls in operationsCore.ts; Wasp injects exactly these two entities). */
type AnalyticsEventEntities = {
  AnalyticsSession: {
    findFirst(args: {
      where: { userId: string };
      orderBy: { lastSeenAt: "desc" };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null } | null>;
    update(args: {
      where: { id: string };
      data: { lastSeenAt: Date };
    }): Promise<{ id: string }>;
    upsert(args: {
      where: { visitorId: string };
      create: {
        visitorId: string;
        userId: string | null;
        referrerHost: string | null;
        utmSource: string | null;
        utmMedium: string | null;
        utmCampaign: string | null;
        utmContent: string | null;
        utmTerm: string | null;
        initialPath: string | null;
        deviceClass: string | null;
      };
      update: { lastSeenAt: Date; userId?: string };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null }>;
  };
  AnalyticsEvent: {
    findFirst(args: {
      where: { userId: string; name: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        name: string;
        route: string | null;
        appVersion: string | null;
        metadata: Record<string, string | number | boolean | null> | null;
        sessionId: string;
        userId: string | null;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

type ApiContext = {
  user?: { id: string } | null;
  entities: AnalyticsEventEntities;
};

const EVENT_NAMES = new Set<string>(ANALYTICS_EVENTS);

function isEventName(value: string): value is AnalyticsEventName {
  return EVENT_NAMES.has(value);
}

/** A JSON record as JSON.parse produces for an object body. */
type JsonRecord = { [key: string]: JsonValue };

/** Read a string field; non-strings drop (the recorder's clean() nulled them). */
function textOf(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return isJsonString(value) ? value : undefined;
}

/**
 * Metadata as the recorder accepts it: primitive values only, keyed by name.
 * Arrays/objects and null drop here — the recorder's validateMetadata()
 * dropped them anyway after the old whole-body cast let them through.
 */
function metadataOf(
  value: JsonValue | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!(value instanceof Object) || Array.isArray(value)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isJsonString(entry) || isJsonNumber(entry) || isJsonBoolean(entry)) {
      out[key] = entry;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Decode a request body (or stringified body) into an AnalyticsEventInput.
 * Every field is read + validated here — the whole-body cast is gone.
 */
function bodyInput(
  body: JsonValue | string | undefined,
): AnalyticsEventInput | null {
  let parsed: JsonValue | string | undefined = body;
  if (isJsonString(body)) {
    // A raw string body arrives JSON-encoded — decode before reading fields.
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!parsed || !(parsed instanceof Object) || Array.isArray(parsed))
    return null;
  const record = parsed;
  const name = textOf(record, "name");
  const visitorId = textOf(record, "visitorId");
  if (!name || !visitorId || !isEventName(name)) return null;
  return {
    name,
    visitorId,
    route: textOf(record, "route") ?? null,
    appVersion: textOf(record, "appVersion") ?? null,
    metadata: metadataOf(record.metadata) ?? null,
    referrerHost: textOf(record, "referrerHost") ?? null,
    utmSource: textOf(record, "utmSource") ?? null,
    utmMedium: textOf(record, "utmMedium") ?? null,
    utmCampaign: textOf(record, "utmCampaign") ?? null,
    utmContent: textOf(record, "utmContent") ?? null,
    utmTerm: textOf(record, "utmTerm") ?? null,
    initialPath: textOf(record, "initialPath") ?? null,
    deviceClass: textOf(record, "deviceClass") ?? null,
  };
}

/** Public marketing/app bridge. It records no PII and never returns event data. */
export async function recordAnalyticsEventApi(
  req: Request,
  res: Response,
  context: ApiContext,
) {
  const input = bodyInput(req.body);
  if (!input)
    return res.status(400).json({ error: "Invalid analytics event." });
  try {
    await recordAnalyticsEventCore(
      context.entities,
      input,
      context.user?.id ?? null,
    );
    return res.status(204).end();
  } catch (error) {
    console.warn(
      "[analytics] event rejected",
      error instanceof Error ? error.message : error,
    );
    return res.status(400).json({ error: "Invalid analytics event." });
  }
}
