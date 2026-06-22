/* Push-only service worker for bookgravity PWA notifications.
   Deliberately does NOT cache fetches - we don't want to reintroduce the
   stale-bundle problem the VersionWatcher fixed. It only shows notifications
   pushed from the server and routes taps to the inbox. */

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "New message", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "New message"
  const options = {
    body: data.body || "",
    icon: "/icon-default.png",
    badge: "/icon-default.png",
    data: data.data || {},
    tag: (data.data && data.data.conversationId) || undefined,
    renotify: true,
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = "/admin/inbox"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(target).catch(() => {})
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
