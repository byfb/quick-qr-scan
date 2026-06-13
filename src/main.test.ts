import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, saveScanToStore } from "./history";
import { createScannerApp } from "./main";

describe("Quick QR Scan app shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders stored history on startup", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("closed");
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

  it("opens the history drawer with a dedicated edge trigger", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-history"]')?.click();

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("open");
  });

  it("closes the history drawer when clicking outside it", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-history"]')?.click();
    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("closed");
  });

  it("marks the app shell as no-select to prevent accidental text highlighting", () => {
    const root = document.createElement("div");

    createScannerApp(root, { storage: createMemoryStore() });

    expect(root.querySelector<HTMLElement>(".app")?.dataset.textSelect).toBe("off");
  });

  it("shows icon actions on recent scans", () => {
    const root = document.createElement("div");
    const store = createMemoryStore();
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const openUrl = vi.fn();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));
    saveScanToStore(store, "https://example.com/check", new Date("2026-06-13T10:01:00Z"));

    createScannerApp(root, { storage: store, clipboard, openUrl });

    root.querySelector<HTMLButtonElement>("[data-history-action='copy'][data-history-value='ASSET-42']")?.click();
    root
      .querySelector<HTMLButtonElement>("[data-history-action='open'][data-history-value='https://example.com/check']")
      ?.click();
    root.querySelector<HTMLButtonElement>("[data-history-action='delete'][data-history-value='ASSET-42']")?.click();

    expect(clipboard.writeText).toHaveBeenCalledWith("ASSET-42");
    expect(openUrl).toHaveBeenCalledWith("https://example.com/check");
    expect(root.textContent).not.toContain("ASSET-42");
  });

  it("clicks the camera stage to focus near the tap and disable auto controls", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      applyConstraints,
      getCapabilities: () => ({
        focusMode: ["continuous", "single-shot"],
        pointsOfInterest: true,
        zoom: { min: 1, max: 4, step: 0.5 },
      }),
      stop: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    };
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    };
    const root = document.createElement("div");
    createScannerApp(root, {
      mediaDevices: mediaDevices as unknown as MediaDevices,
      storage: createMemoryStore(),
      requestFrame: () => 0,
      cancelFrame: vi.fn(),
    });
    const stage = root.querySelector<HTMLElement>("[data-role='camera-stage']");
    vi.spyOn(stage!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      toJSON: () => ({}),
    });

    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    stage?.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 150, bubbles: true }));
    await Promise.resolve();

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Manual");
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: "single-shot" }, { pointsOfInterest: [{ x: 0.25, y: 0.5 }] }],
    });
  });

  it("disables automatic controls when the camera controls panel opens", () => {
    const root = document.createElement("div");
    createScannerApp(root, { storage: createMemoryStore() });
    const controls = root.querySelector<HTMLDetailsElement>("[data-role='camera-controls']");

    controls!.open = true;
    controls!.dispatchEvent(new Event("toggle"));

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Manual");
  });
});
