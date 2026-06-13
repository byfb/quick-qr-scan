import { describe, expect, it, vi } from "vitest";
import { createMemoryStore, saveScanToStore } from "./history";
import { createScannerApp } from "./main";

describe("Quick QR Scan app shell", () => {
  it("renders stored history on startup", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    expect(root.textContent).toContain("Quick QR Scan");
    expect(root.textContent).toContain("ASSET-42");
  });

  it("shows a camera unavailable message when media devices are missing", async () => {
    const root = document.createElement("div");
    createScannerApp(root, { mediaDevices: undefined, storage: createMemoryStore() });

    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain(
      "Camera API unavailable",
    );
  });

  it("opens only safe URL results from history", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    const openUrl = vi.fn();
    saveScanToStore(store, "javascript:alert(1)", new Date("2026-06-13T10:00:00Z"));
    saveScanToStore(store, "https://example.com/check", new Date("2026-06-13T10:01:00Z"));

    createScannerApp(root, { storage: store, openUrl });

    root.querySelector<HTMLButtonElement>("[data-history-value='https://example.com/check']")?.click();
    root.querySelector<HTMLButtonElement>('[data-action="open-selected"]')?.click();

    root.querySelector<HTMLButtonElement>("[data-history-value='javascript:alert(1)']")?.click();

    expect(root.querySelector<HTMLButtonElement>('[data-action="open-selected"]')?.hidden).toBe(true);
    expect(openUrl).toHaveBeenCalledWith("https://example.com/check");
  });

  it("deletes the selected history item", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));
    saveScanToStore(store, "ASSET-43", new Date("2026-06-13T10:01:00Z"));

    createScannerApp(root, { storage: store });

    root.querySelector<HTMLButtonElement>("[data-history-value='ASSET-42']")?.click();
    root.querySelector<HTMLButtonElement>('[data-action="delete-selected"]')?.click();

    expect(root.textContent).not.toContain("ASSET-42");
    expect(root.textContent).toContain("ASSET-43");
  });
});
