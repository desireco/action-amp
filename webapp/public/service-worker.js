/* ActionAmp's deliberately small PWA worker.
 *
 * Authenticated data is never cached here. Wasp's client bundle handles the
 * normal network experience; this worker owns push delivery and notification
 * clicks only. Keeping cache out avoids stale/private task data on a shared
 * device while still making the app installable and actionable.
 *
 * Update flow: a new worker waits until the app's update banner asks it to
 * activate. Auto-activating here races that banner and can cause reload loops
 * in installed Android PWAs.
 */
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Android share_target requests must stay on the PWA's origin (app.actionamp.com),
// while ActionAmp's API runs at api.actionamp.com. Store the form body briefly
// in same-origin IndexedDB, then send the activity to the review page. The
// page saves only after the user chooses "Add to inbox". Files are persisted
// as IndexedDB Blobs so an image share survives the handoff to the review UI.
const SHARE_PATH = "/share";
const SHARE_DB_NAME = "actionamp-share";
const SHARE_STORE_NAME = "pending";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const fields = {};
    for (const field of ["title", "text", "url"]) {
      const value = formData.get(field);
      if (typeof value === "string") fields[field] = value;
    }
    const files = formData.getAll("files")
      .filter((value) => value instanceof File && value.type.startsWith("image/"))
      .map((file) => ({ blob: file, filename: file.name || "Shared image", mimeType: file.type, size: file.size }));
    const id = await savePendingShare({ fields, files });
    return Response.redirect(new URL(`/share?pending=${encodeURIComponent(id)}`, self.location.origin), 303);
  } catch {
    return Response.redirect(new URL("/share?error=server", self.location.origin), 303);
  }
}

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SHARE_STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePendingShare({ fields, files }) {
  const id = self.crypto.randomUUID();
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE_NAME, "readwrite");
    transaction.objectStore(SHARE_STORE_NAME).put({ id, fields, files, createdAt: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  return id;
}

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title || "ActionAmp", {
      body: payload.body || "Choose what matters today.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "daily-today",
      renotify: false,
      data: { url: payload.url || "/app/today" },
      actions: [
        { action: "capture", title: "Capture" },
        { action: "next", title: "Next task" },
        { action: "today", title: "Today" }
      ]
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const paths = {
    capture: "/app?capture=1",
    next: "/app",
    today: "/app/today"
  };
  const url = new URL(paths[event.action] || event.notification.data?.url || "/app/today", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(url);
      return existing.focus();
    }
    return self.clients.openWindow(url);
  })());
});
