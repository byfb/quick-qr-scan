import { describe, expect, it } from "vitest";
import {
  addScanToHistory,
  clearStoredHistory,
  createMemoryStore,
  deleteScanFromHistory,
  readStoredHistory,
  saveScanToStore,
} from "./history";

describe("scan history", () => {
  it("adds new scans newest first", () => {
    const history = addScanToHistory([], "https://example.com", new Date("2026-06-13T10:00:00Z"));

    expect(history).toEqual([
      {
        value: "https://example.com",
        firstScannedAt: "2026-06-13T10:00:00.000Z",
        lastScannedAt: "2026-06-13T10:00:00.000Z",
        scanCount: 1,
      },
    ]);
  });

  it("updates duplicate scans instead of adding rows", () => {
    const first = addScanToHistory([], "ASSET-42", new Date("2026-06-13T10:00:00Z"));
    const second = addScanToHistory(first, "ASSET-42", new Date("2026-06-13T10:05:00Z"));

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      value: "ASSET-42",
      firstScannedAt: "2026-06-13T10:00:00.000Z",
      lastScannedAt: "2026-06-13T10:05:00.000Z",
      scanCount: 2,
    });
  });

  it("keeps only the latest 20 unique scans", () => {
    const history = Array.from({ length: 25 }).reduce(
      (items, _, index) => addScanToHistory(items, `CODE-${index}`, new Date(2026, 5, 13, 10, index)),
      [],
    );

    expect(history).toHaveLength(20);
    expect(history[0]?.value).toBe("CODE-24");
    expect(history[19]?.value).toBe("CODE-5");
  });

  it("deletes a scan by exact value", () => {
    const history = addScanToHistory(
      addScanToHistory([], "A", new Date("2026-06-13T10:00:00Z")),
      "B",
      new Date("2026-06-13T10:01:00Z"),
    );

    expect(deleteScanFromHistory(history, "A").map((item) => item.value)).toEqual(["B"]);
  });

  it("saves and clears local storage history", () => {
    const store = createMemoryStore();

    saveScanToStore(store, "A", new Date("2026-06-13T10:00:00Z"));
    saveScanToStore(store, "B", new Date("2026-06-13T10:01:00Z"));

    expect(readStoredHistory(store).map((item) => item.value)).toEqual(["B", "A"]);

    clearStoredHistory(store);

    expect(readStoredHistory(store)).toEqual([]);
  });

  it("returns empty history for corrupt stored JSON", () => {
    const store = createMemoryStore({ "quick-qr-scan:history:v1": "not-json" });

    expect(readStoredHistory(store)).toEqual([]);
  });
});
