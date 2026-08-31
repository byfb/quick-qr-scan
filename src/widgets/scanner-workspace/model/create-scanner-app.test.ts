import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, saveScanToStore } from "../../../entities/scan-history";
import { createScannerApp, scannerWorkspaceMarkup } from "..";

describe("Quick QR Scan app shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createReadyCamera() {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const track = {
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({}),
      stop: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    };

    return {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      } as unknown as MediaDevices,
      track,
    };
  }

  function createFrameRunner(maxFrames = 1): (callback: FrameRequestCallback) => number {
    let frameCount = 0;
    return (callback: FrameRequestCallback) => {
      if (frameCount < maxFrames) {
        frameCount += 1;
        queueMicrotask(() => callback(100 * frameCount));
      }
      return frameCount;
    };
  }

  function createRoot(): HTMLDivElement {
    const root = document.createElement("div");
    root.innerHTML = scannerWorkspaceMarkup;
    return root;
  }

  async function flushAsync(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }

  it("renders stored history on startup", () => {
    const root = createRoot();
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("closed");
    expect(root.textContent).toContain("ASSET-42");
  });

  it("shows a camera unavailable message when media devices are missing", async () => {
    const root = createRoot();
    createScannerApp(root, { mediaDevices: undefined, storage: createMemoryStore() });

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await Promise.resolve();

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain(
      "Camera API unavailable",
    );
  });

  it("starts the camera from the main camera view", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const track = {
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({}),
      stop: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    };
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    };
    const root = createRoot();

    createScannerApp(root, {
      mediaDevices: mediaDevices as unknown as MediaDevices,
      storage: createMemoryStore(),
      requestFrame: () => 0,
      cancelFrame: vi.fn(),
    });

    expect(root.querySelector<HTMLButtonElement>('[data-action="start"]')).toBeNull();

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await flushAsync();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Scanning");
  });

  it("starts the camera from the main camera view with keyboard activation", async () => {
    const { mediaDevices } = createReadyCamera();
    const root = createRoot();

    createScannerApp(root, {
      mediaDevices,
      storage: createMemoryStore(),
      requestFrame: () => 0,
      cancelFrame: vi.fn(),
    });

    root
      .querySelector<HTMLElement>("[data-role='camera-stage']")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flushAsync();

    expect(mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>("[data-role='camera-stage']")?.getAttribute("aria-label")).toBe(
      "Scanner active",
    );
  });

  it("resumes scanning from the main camera view after a successful scan", async () => {
    const { mediaDevices } = createReadyCamera();
    const root = createRoot();

    createScannerApp(root, {
      mediaDevices,
      storage: createMemoryStore(),
      requestFrame: createFrameRunner(),
      cancelFrame: vi.fn(),
      testDetections: [
        {
          value: "ASSET-42",
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 2, y: 2 },
            { x: 1, y: 2 },
          ],
        },
      ],
    });

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await flushAsync();

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Tap camera view");

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Scanning");
  });

  it("opens only safe URL results from history", () => {
    const root = createRoot();
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
    const root = createRoot();
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
    const root = createRoot();
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-history"]')?.click();

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("open");
  });

  it("opens the history drawer by swiping left from the right edge", () => {
    const root = createRoot();
    createScannerApp(root, { storage: createMemoryStore() });
    const edge = root.querySelector<HTMLElement>("[data-role='history-edge']");

    edge?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 390, bubbles: true }));
    edge?.dispatchEvent(new MouseEvent("pointermove", { clientX: 340, bubbles: true }));

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("open");
  });

  it("closes the history drawer when clicking outside it", () => {
    const root = createRoot();
    const store = createMemoryStore();
    saveScanToStore(store, "ASSET-42", new Date("2026-06-13T10:00:00Z"));

    createScannerApp(root, { storage: store });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-history"]')?.click();
    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();

    expect(root.querySelector<HTMLElement>("[data-role='history-drawer']")?.dataset.state).toBe("closed");
  });

  it("marks the app shell as no-select to prevent accidental text highlighting", () => {
    const root = createRoot();

    createScannerApp(root, { storage: createMemoryStore() });

    expect(root.querySelector<HTMLElement>(".app")?.dataset.textSelect).toBe("off");
  });

  it("renders offline cache status and a force-refresh action", () => {
    const root = createRoot();

    createScannerApp(root, { storage: createMemoryStore() });

    expect(root.querySelector<HTMLElement>("[data-role='offline-status']")?.textContent).toContain("Offline");
    expect(root.querySelector<HTMLButtonElement>("[data-action='refresh-app']")?.textContent).toContain("Refresh");
  });

  it("shows icon actions on recent scans", () => {
    const root = createRoot();
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
    const root = createRoot();
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

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await flushAsync();
    stage?.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 150, bubbles: true }));
    await Promise.resolve();

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Manual");
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: "single-shot" }, { pointsOfInterest: [{ x: 0.25, y: 0.5 }] }],
    });
  });

  it("disables automatic controls when the camera controls panel opens", () => {
    const root = createRoot();
    createScannerApp(root, { storage: createMemoryStore() });
    const controls = root.querySelector<HTMLDetailsElement>("[data-role='camera-controls']");

    controls!.open = true;
    controls!.dispatchEvent(new Event("toggle"));

    expect(root.querySelector<HTMLElement>("[data-role='status']")?.textContent).toContain("Manual");
  });

  it("defaults auto-open links off and persists changes", () => {
    const store = createMemoryStore();
    const root = createRoot();

    createScannerApp(root, { storage: store });

    const toggle = root.querySelector<HTMLInputElement>('[data-action="auto-open-links"]');
    expect(toggle?.checked).toBe(false);

    toggle!.checked = true;
    toggle?.dispatchEvent(new Event("change"));

    const nextRoot = createRoot();
    createScannerApp(nextRoot, { storage: store });

    expect(nextRoot.querySelector<HTMLInputElement>('[data-action="auto-open-links"]')?.checked).toBe(true);
  });

  it("prompts before opening a scanned URL when auto-open links is off", async () => {
    const root = createRoot();
    const openUrl = vi.fn();
    const { mediaDevices, track } = createReadyCamera();

    createScannerApp(root, {
      storage: createMemoryStore(),
      mediaDevices,
      openUrl,
      requestFrame: createFrameRunner(),
      cancelFrame: vi.fn(),
      testDetections: [
        {
          value: "https://example.com/check",
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 2, y: 2 },
            { x: 1, y: 2 },
          ],
        },
      ],
    });

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await flushAsync();

    expect(root.querySelector<HTMLElement>("[data-role='link-prompt']")).not.toBeNull();
    expect(root.querySelector<HTMLElement>("[data-role='link-prompt']")?.textContent).toContain("example.com");
    expect(openUrl).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('[data-action="confirm-open-link"]')?.click();

    expect(openUrl).toHaveBeenCalledWith("https://example.com/check");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(track.stop.mock.invocationCallOrder[0]).toBeLessThan(openUrl.mock.invocationCallOrder[0]!);
    expect(root.querySelector<HTMLVideoElement>("[data-role='video']")?.srcObject).toBeNull();
  });

  it("auto-opens scanned URLs without a prompt when auto-open links is on", async () => {
    const store = createMemoryStore({
      "quick-qr-scan:auto-open-links:v1": "true",
    });
    const root = createRoot();
    const openUrl = vi.fn();
    const { mediaDevices, track } = createReadyCamera();

    createScannerApp(root, {
      storage: store,
      mediaDevices,
      openUrl,
      requestFrame: createFrameRunner(),
      cancelFrame: vi.fn(),
      testDetections: [
        {
          value: "https://example.com/check",
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 2, y: 2 },
            { x: 1, y: 2 },
          ],
        },
      ],
    });

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await flushAsync();

    expect(openUrl).toHaveBeenCalledWith("https://example.com/check");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(track.stop.mock.invocationCallOrder[0]).toBeLessThan(openUrl.mock.invocationCallOrder[0]!);
    expect(root.querySelector<HTMLElement>("[data-role='link-prompt']")).toBeNull();
  });

  it("does not auto-open scanned URLs when offline even if auto-open links is on", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const store = createMemoryStore({
      "quick-qr-scan:auto-open-links:v1": "true",
    });
    const root = createRoot();
    const openUrl = vi.fn();
    const { mediaDevices } = createReadyCamera();

    createScannerApp(root, {
      storage: store,
      mediaDevices,
      openUrl,
      requestFrame: createFrameRunner(),
      cancelFrame: vi.fn(),
      testDetections: [
        {
          value: "https://example.com/check",
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 2, y: 2 },
            { x: 1, y: 2 },
          ],
        },
      ],
    });

    root.querySelector<HTMLElement>("[data-role='camera-stage']")?.click();
    await flushAsync();

    expect(openUrl).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>("[data-role='link-prompt']")).toBeNull();
    expect(root.querySelector<HTMLElement>("[data-role='result']")?.textContent).toBe("https://example.com/check");
  });
});
