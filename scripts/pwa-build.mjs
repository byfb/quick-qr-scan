import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, sep, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_WORKER_FILE = "sw.js";
const CACHE_PREFIX = "quick-qr-scan";
const EXCLUDED_PRECACHE_FILES = new Set([SERVICE_WORKER_FILE, "_headers", "_redirects"]);

export async function collectPrecacheUrls(distDir) {
  const files = await collectFiles(distDir);
  const urls = files
    .filter((file) => !EXCLUDED_PRECACHE_FILES.has(file))
    .map((file) => `/${file.split(sep).join("/")}`)
    .sort();

  if (urls.includes("/index.html")) {
    urls.unshift("/");
  }

  return urls;
}

export async function writePwaServiceWorker(distDir) {
  const urls = await collectPrecacheUrls(distDir);
  const revision = await createRevision(distDir, urls);
  const source = buildServiceWorkerSource(urls, revision);
  await writeFile(join(distDir, SERVICE_WORKER_FILE), source);
}

export function buildServiceWorkerSource(urls, revision) {
  return `const CACHE_NAME = "${CACHE_PREFIX}-${revision}";
const PRECACHE_URLS = ${JSON.stringify(urls, null, 2)};

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("${CACHE_PREFIX}-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, ["/", "/index.html"]));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbacks) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    for (const fallback of fallbacks) {
      const cached = await caches.match(fallback);
      if (cached) {
        return cached;
      }
    }
    return Response.error();
  }
}
`;
}

export function quickQrPwa() {
  return {
    name: "quick-qr-pwa",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        await writePwaServiceWorker(fileURLToPath(dir));
      },
    },
  };
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(root, absolutePath);
      }
      if (!entry.isFile()) {
        return [];
      }
      return [relative(root, absolutePath)];
    }),
  );

  return files.flat();
}

async function createRevision(distDir, urls) {
  const hash = createHash("sha256");
  for (const url of urls) {
    if (url === "/") {
      continue;
    }
    hash.update(url);
    hash.update(await readFile(join(distDir, url.slice(1))));
  }
  return hash.digest("hex").slice(0, 16);
}
