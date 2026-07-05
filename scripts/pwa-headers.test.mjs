import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA response headers", () => {
  it("keeps service worker updates uncached and camera permission available", async () => {
    const headers = await readFile("public/_headers", "utf8");

    expect(headers).toContain("Permissions-Policy: camera=(self)");
    expect(headers).toContain("/sw.js");
    expect(headers).toContain("Cache-Control: no-cache, no-store, must-revalidate");
    expect(headers).toContain("Service-Worker-Allowed: /");
    expect(headers).toContain("/manifest.webmanifest");
  });
});
