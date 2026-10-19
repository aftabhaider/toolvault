/* ToolVault PDF-to-Word offline cache.
 * First online visit downloads the public conversion libraries and stores them
 * under same-origin paths. The PDF itself is never sent to a conversion API.
 */
"use strict";

const CACHE_NAME = "toolvault-pdf-word-v19";
const PREFIX = "toolvault-pdf-word-";
const SHELL = [
  "/documents/pdf-to-word",
  "/documents/pdf-to-word.html",
  "/documents/pdf-to-word-engine.js"
];

const ASSETS = {
  "/documents/vendor/pdf.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "/documents/vendor/pdf.worker.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "/documents/vendor/docx.umd.js": "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  "/documents/vendor/tesseract.min.js": "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "/documents/vendor/tesseract.worker.min.js": "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  "/documents/vendor/tesseract-core/tesseract-core.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js",
  "/documents/vendor/tesseract-core/tesseract-core.wasm": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm",
  "/documents/vendor/tesseract-core/tesseract-core-simd.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js",
  "/documents/vendor/tesseract-core/tesseract-core-simd.wasm": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm",
  "/documents/vendor/tesseract-core/tesseract-core-lstm.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js",
  "/documents/vendor/tesseract-core/tesseract-core-lstm.wasm": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm",
  "/documents/vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
  "/documents/vendor/tesseract-core/tesseract-core-simd-lstm.wasm": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm",
  "/documents/vendor/lang/eng.traineddata.gz": "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz"
};

const CORE_ASSETS = [
  "/documents/vendor/pdf.min.js",
  "/documents/vendor/pdf.worker.min.js",
  "/documents/vendor/docx.umd.js"
];

function absolute(path) {
  return new URL(path, self.location.origin).href;
}

function assetKey(requestUrl) {
  const url = new URL(requestUrl);
  return url.origin === self.location.origin ? url.pathname : null;
}

async function fetchAndCacheSameOrigin(path) {
  const key = absolute(path);
  try {
    const response = await fetch(key, { cache: "reload", credentials: "same-origin" });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(key, response.clone());
      return true;
    }
  } catch (_) {}
  return false;
}

async function fetchAndCacheRemote(path) {
  const remoteUrl = ASSETS[path];
  if (!remoteUrl) return false;
  const localUrl = absolute(path);
  try {
    const response = await fetch(remoteUrl, {
      mode: "cors",
      credentials: "omit",
      cache: "default"
    });
    if (!response || !response.ok) return false;
    // Rebuild the cross-origin response as a normal Response. The app and
    // Worker scripts request same-origin URLs; a basic same-origin response
    // avoids opaque/CORS response-type mismatches for classic scripts/workers.
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const localResponse = new Response(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000"
      }
    });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(localUrl, localResponse.clone());
    return true;
  } catch (_) {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await caches.open(CACHE_NAME);
    // Cache the current converter page and its engine for offline navigation.
    await Promise.allSettled(SHELL.map(fetchAndCacheSameOrigin));
    // The basic local converter works without OCR, so keep only its required
    // libraries in the install-time download. OCR assets are fetched lazily.
    await Promise.allSettled(CORE_ASSETS.map(fetchAndCacheRemote));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (Object.prototype.hasOwnProperty.call(ASSETS, path)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(absolute(path));
      if (cached) return cached;
      const succeeded = await fetchAndCacheRemote(path);
      const retried = await cache.match(absolute(path));
      if (retried) return retried;
      return new Response("This conversion component is not cached yet. Connect to the internet and reload the PDF-to-Word page.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    })());
    return;
  }

  const isConverterPage = path === "/documents/pdf-to-word" ||
    path === "/documents/pdf-to-word.html" ||
    path === "/documents/pdf-to-word/";
  if (request.mode === "navigate" && isConverterPage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const candidates = [
        absolute("/documents/pdf-to-word"),
        absolute("/documents/pdf-to-word.html"),
        absolute("/documents/pdf-to-word/")
      ];
      for (const candidate of candidates) {
        const found = await cache.match(candidate);
        if (found) return found;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(absolute("/documents/pdf-to-word"), response.clone());
        }
        return response;
      } catch (_) {
        return new Response("The PDF-to-Word page is not cached yet. Open it once while connected to the internet, then try again offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    })());
    return;
  }

  if (path === "/documents/pdf-to-word-engine.js" || path === "/documents/pdf-to-word-sw.js") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(absolute(path));
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(absolute(path), response.clone());
        return response;
      } catch (_) {
        return new Response("The offline converter file is not available yet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    })());
  }
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "TOOLVAULT_OFFLINE_STATUS") return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const core = CORE_ASSETS.map(absolute);
    const cachedCore = [];
    for (const url of core) cachedCore.push(Boolean(await cache.match(url)));
    const ocr = Object.keys(ASSETS).filter((path) => path.includes("/tesseract") || path.includes("/lang/"));
    let cachedOcr = 0;
    for (const path of ocr) if (await cache.match(absolute(path))) cachedOcr++;
    event.source?.postMessage({
      type: "TOOLVAULT_OFFLINE_STATUS_RESULT",
      coreCached: cachedCore.every(Boolean),
      coreCount: cachedCore.filter(Boolean).length,
      coreTotal: core.length,
      ocrCount: cachedOcr,
      ocrTotal: ocr.length
    });
  })());
});
