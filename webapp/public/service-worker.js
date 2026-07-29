/* ActionAmp's deliberately small PWA worker.
 *
 * Authenticated data is never cached here. Wasp's client bundle handles the
 * normal network experience; this worker owns push delivery and notification
 * clicks only. Keeping cache out avoids stale/private task data on a shared
 * device while still making the app installable and actionable.
 *
 * Update flow: activate immediately. The share target relies on this worker to
 * handle POSTs, and an installed PWA otherwise keeps an older worker until a
 * user sees and accepts an update prompt.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Android share_target requests must stay on the PWA's origin (app.actionamp.com),
// while ActionAmp's API runs at api.actionamp.com. Intercept the POST at /share,
// forward its form body to the API with the existing same-site session cookie,
// then send the share activity to the app-origin confirmation page.
//
// This keeps the server API separate without asking the static client host to
// accept POST requests. No share content is stored in the service worker.
const SHARE_PATH = "/share";
const SHARE_API_URL = "https://api.actionamp.com/api/share?response=json";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const body = new URLSearchParams();
    for (const field of ["title", "text", "url"]) {
      const value = formData.get(field);
      if (typeof value === "string") body.set(field, value);
    }

    const response = await fetch(SHARE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      credentials: "include",
    });
    if (!response.ok) return Response.redirect(new URL("/share?error=server", self.location.origin), 303);

    const { redirect } = await response.json();
    if (typeof redirect !== "string" || !redirect.startsWith("/")) {
      return Response.redirect(new URL("/share?error=server", self.location.origin), 303);
    }
    return Response.redirect(new URL(redirect, self.location.origin), 303);
  } catch {
    return Response.redirect(new URL("/share?error=server", self.location.origin), 303);
  }
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
