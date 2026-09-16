const CACHE = "coc-timers-v23";
const ASSETS = [
  "./",
  "./index.html",
  "./privacidad.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/parser.js",
  "./js/ids.js",
  "./js/storage.js",
  "./js/notify.js",
  "./js/push.js",
  "./js/firebase-config.js",
  "./images/aldea.jpg",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCwLaj-3QQg9WmZAyXzNAz3JGcYkXiEz-M",
  authDomain: "coc-timers.firebaseapp.com",
  projectId: "coc-timers",
  storageBucket: "coc-timers.firebasestorage.app",
  messagingSenderId: "708377560257",
  appId: "1:708377560257:web:9f211ff4a3178394db0040",
});
firebase.messaging();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        ASSETS.map((url) => cache.add(url).catch(() => undefined))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
