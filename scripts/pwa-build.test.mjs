import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { collectPrecacheUrls, writePwaServiceWorker } from "./pwa-build.mjs";

describe("PWA service worker build", () => {
  it("collects the static export shell and ignores generated service worker files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quick-qr-scan-pwa-"));
    try {
      await mkdir(join(dir, "_astro"), { recursive: true });
      await mkdir(join(dir, "icons"), { recursive: true });
      await writeFile(join(dir, "index.html"), "<html></html>");
      await writeFile(join(dir, "_astro", "app.abc123.js"), "console.log('app')");
      await writeFile(join(dir, "_astro", "app.abc123.css"), "body{}");
      await writeFile(join(dir, "icons", "icon.svg"), "<svg />");
      await writeFile(join(dir, "manifest.webmanifest"), "{}");
      await writeFile(join(dir, "sw.js"), "old");

      await expect(collectPrecacheUrls(dir)).resolves.toEqual([
        "/",
        "/_astro/app.abc123.css",
        "/_astro/app.abc123.js",
        "/icons/icon.svg",
        "/index.html",
        "/manifest.webmanifest",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a service worker that can activate waiting updates on demand", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quick-qr-scan-pwa-"));
    try {
      await writeFile(join(dir, "index.html"), "<html></html>");

      await writePwaServiceWorker(dir);

      const serviceWorker = await readFile(join(dir, "sw.js"), "utf8");
      expect(serviceWorker).toContain('"/"');
      expect(serviceWorker).toContain('"SKIP_WAITING"');
      expect(serviceWorker).toContain("self.skipWaiting()");
      expect(serviceWorker).toContain("request.mode === \"navigate\"");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
