const CACHE = "halo-v3-local-external";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./gestureEngine.js",
  "./handTracker.js",
  "./keyboardRenderer.js",
  "./uiControls.js",
  "./voiceInput.js",
  "./utils.js",
  "./words.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./external/vision_bundle.mjs",
  "./external/hand_landmarker.task",
  "./external/vision_wasm_internal.js",
  "./external/vision_wasm_internal.wasm",
  "./external/vision_wasm_module_internal.js",
  "./external/vision_wasm_module_internal.wasm",
  "./external/vision_wasm_nosimd_internal.js",
  "./external/vision_wasm_nosimd_internal.wasm"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
