/**
 * S12 — the share-target client: field composition + the IndexedDB pending
 * stash + image-file helpers. Browser-side twin of the canonical server copy
 * in apps/api/src/share.ts (`composeShareCapture`/`composeShareText`) —
 * CLIENT COPY, keep in sync (the capture-parser precedent,
 * apps/web/src/lib/capture/parse.ts).
 *
 * Pending-share mechanics ported from webapp/src/share/pendingShare.ts: the
 * service worker intercepts same-origin `POST /share` (the manifest's
 * share_target action), stashes the multipart form here, and 303s to
 * `/share?pending=<id>` — nothing reaches the server until the user confirms.
 */
import { client } from "./api";

// ----------------------------------------------------------------
// Field composition (canonical: apps/api/src/share.ts)
// ----------------------------------------------------------------

const MAX_FIELD_LEN = 2000;

export type ShareFields = {
  title?: string;
  text?: string;
  url?: string;
};

export type ShareCapture = {
  title: string;
  content: string;
  url: string;
  text: string;
};

function clean(v: string | undefined): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (trimmed.length <= MAX_FIELD_LEN) return trimmed;
  return trimmed.slice(0, MAX_FIELD_LEN) + "…";
}

export function composeShareCapture(fields: ShareFields): ShareCapture {
  const title = clean(fields.title);
  let text = clean(fields.text);
  let url = clean(fields.url);

  // No content at all → empty (caller decides what to do).
  if (!title && !text && !url) return { title: "", content: "", url: "", text: "" };

  // Some Android shares put the page title in `title`, then repeat it at the
  // start of `text` before the URL. Keep the useful link without making the
  // inbox item read like "Title: Title https://…".
  if (title && text) {
    const titlePrefix = `${title} `;
    if (text === title) text = "";
    else if (text.startsWith(titlePrefix)) {
      text = text.slice(titlePrefix.length).trim();
      if (!url && /^https?:\/\/\S+$/i.test(text)) {
        url = text;
        text = "";
      }
    }
  }

  // URL always appended last, after " — ", when present.
  const tail = url ? ` — ${url}` : "";
  const composed = title && text
    ? `${title}: ${text}${tail}`
    : title
      ? `${title}${tail}`
      : text
        ? `${text}${tail}`
        : url;

  return { title, content: text, url, text: composed };
}

export function composeShareText(fields: ShareFields): string {
  return composeShareCapture(fields).text;
}

// ----------------------------------------------------------------
// Image-file helpers (webapp src/shared/imageFiles.ts, the two used here)
// ----------------------------------------------------------------

/** Read a Blob as a bare base64 string (no data: URL prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Read a Blob/File as a data: URL for <img> previews. The deploy host's CSP
 * allows data: but not blob: image sources — object URLs render as broken
 * images in production. Data URLs need no revoke; dropping the last
 * reference frees them.
 */
export function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ----------------------------------------------------------------
// The IndexedDB pending stash (webapp src/share/pendingShare.ts)
// ----------------------------------------------------------------

export type PendingShareImage = {
  blob: Blob;
  filename: string;
  mimeType: string;
  size: number;
};

export type PendingShare = {
  id: string;
  fields: ShareFields;
  files?: PendingShareImage[];
  createdAt: number;
};

const DB_NAME = "actionamp-share";
const STORE_NAME = "pending";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingShare(id: string): Promise<PendingShare | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      request.onsuccess = () => resolve((request.result as PendingShare | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearPendingShare(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

// ----------------------------------------------------------------
// The confirm fan-out (SharePage's server writes, extracted for the page)
// ----------------------------------------------------------------

/** The resolver source row (contract ResolverProjectSchema). */
export interface ResolverProject {
  id: string;
  name: string;
  permalink: string;
  type: "STANDARD" | "SIMPLE_LIST";
  lensId: string;
  lensName: string | null;
  lensColor: string | null;
}

interface InboxClientSlice {
  create(input: {
    text: string;
    title?: string;
    content?: string;
    sourceUrl?: string;
    projectId?: string;
    timeZone?: string;
  }): Promise<{ id: string }>;
  projectsForResolver(): Promise<ResolverProject[]>;
}

interface ResourcesClientSlice {
  create(input: { projectId: string; title: string; url?: string; notes?: string }): Promise<{
    id: string;
  }>;
}

interface TasksClientSlice {
  createListItem(input: {
    projectId: string;
    text: string;
    content?: string;
    sourceUrl?: string;
  }): Promise<{ id: string }>;
}

/** Structurally-typed slices of the shared RPC client (prefs.svelte.ts pattern). */
const inboxRpc = (client as unknown as { inbox: InboxClientSlice }).inbox;
const resourcesRpc = (client as unknown as { resources: ResourcesClientSlice }).resources;
const tasksRpc = (client as unknown as { tasks: TasksClientSlice }).tasks;

/** The destination dropdown source — all-lens projects, most-recent first. */
export function loadResolverProjects(): Promise<ResolverProject[]> {
  return inboxRpc.projectsForResolver();
}

/**
 * The Inbox confirm — the normal authenticated capture op (never a
 * cross-origin share API), so a confirmed item can't be written under a
 * different stale cookie session.
 */
export function createInboxCapture(input: {
  text: string;
  title?: string;
  content?: string;
  sourceUrl?: string;
}): Promise<{ id: string }> {
  return inboxRpc.create({
    ...input,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
}

/** The project confirm — reference material, skips triage. */
export function createProjectResource(input: {
  projectId: string;
  title: string;
  url?: string;
  notes?: string;
}): Promise<{ id: string }> {
  return resourcesRpc.create(input);
}

/** The simple-list confirm — also skips triage. */
export function createSimpleListItem(input: {
  projectId: string;
  text: string;
  content?: string;
  sourceUrl?: string;
}): Promise<{ id: string }> {
  return tasksRpc.createListItem(input);
}
