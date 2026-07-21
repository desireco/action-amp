/* ActionAmp's deliberately small PWA worker.
 *
 * Authenticated data is never cached here. Wasp's client bundle handles the
 * normal network experience; this worker owns push delivery and notification
 * clicks only. Keeping cache out avoids stale/private task data on a shared
 * device while still making the app installable and actionable.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A fetch handler is intentionally present (Chrome requires one for PWA
// installability), but leaves all requests to the browser/network untouched.
self.addEventListener("fetch", () => {});

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
