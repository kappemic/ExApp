/* Shows a notification from the app server and opens the conversation. */
self.addEventListener("push", (event) => {
  let title = "ExApp";
  let body = "Nová zpráva";
  let url = "/chat";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      if (typeof data.title === "string" && data.title.length > 0) title = data.title;
      if (typeof data.body === "string" && data.body.length > 0) body = data.body;
      if (typeof data.url === "string" && data.url.startsWith("/")) url = data.url;
    }
  } catch {
    /* Keep the fallback copy. */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cil = new URL(
    typeof event.notification.data?.url === "string" ? event.notification.data.url : "/chat",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((okna) => {
      for (const okno of okna) {
        if ("focus" in okno) {
          return okno.focus().then((aktivni) => {
            if ("navigate" in aktivni) return aktivni.navigate(cil);
            return aktivni;
          });
        }
      }
      return self.clients.openWindow(cil);
    }),
  );
});
