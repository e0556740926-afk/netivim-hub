// Minimal service worker: push notifications only.
// The PWA itself works fine without this file (manifest.json alone
// covers "add to home screen"); this adds the ability to receive a
// push while the app is closed.

self.addEventListener("push", (event) => {
  let data = { title: "נתיבים שטח", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { /* keep defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/netivim-logo.png",
      badge: "/netivim-logo.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
