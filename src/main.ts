import jsQR from "jsqr";
import "./styles.css";
import {
  buildSupportedConstraints,
  clampZoom,
  normalizeCameraCapabilities,
  type NormalizedCameraCapabilities,
  type RawCameraCapabilities,
} from "./camera";
import {
  addScanToHistory,
  clearStoredHistory,
  createMemoryStore,
  deleteScanFromHistory,
  readStoredHistory,
  writeStoredHistory,
  type HistoryStore,
  type ScanHistoryItem,
} from "./history";
import { enhanceImageData } from "./image";
import { getNextAutoZoom, shouldScanFrame } from "./scanner";
import { classifyScanValue } from "./url";

interface ScannerAppDependencies {
  storage?: HistoryStore;
  mediaDevices?: MediaDevices;
  clipboard?: Pick<Clipboard, "writeText">;
  openUrl?: (href: string) => void;
  now?: () => Date;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

interface DetectedQr {
  value: string;
  points: Array<{ x: number; y: number }>;
}

interface BarcodeDetectorResult {
  rawValue: string;
  cornerPoints?: Array<{ x: number; y: number }>;
  boundingBox?: DOMRectReadOnly;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

interface ScannerState {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  capabilities: NormalizedCameraCapabilities;
  scanning: boolean;
  scanInFlight: boolean;
  currentZoom: number;
  torch: boolean;
  brightness: number;
  contrast: number;
  lastScanAt: number;
  lastZoomAttemptAt: number;
  selectedValue: string | null;
  latestValue: string | null;
  rafId: number | null;
  autoControlEnabled: boolean;
  historyDrawerOpen: boolean;
  swipeStartX: number | null;
}

const emptyCapabilities = normalizeCameraCapabilities({});

export function createScannerApp(root: HTMLElement, dependencies: ScannerAppDependencies = {}): void {
  const storage = dependencies.storage ?? createBrowserStore();
  const mediaDevices = dependencies.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const clipboard = dependencies.clipboard ?? globalThis.navigator?.clipboard;
  const openUrl = dependencies.openUrl ?? ((href: string) => globalThis.open(href, "_blank", "noopener,noreferrer"));
  const now = dependencies.now ?? (() => new Date());
  const requestFrame = dependencies.requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis);
  const cancelFrame = dependencies.cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis);

  root.innerHTML = `
    <main class="app" data-text-select="off">
      <div class="shell">
        <section class="workspace" aria-label="Scanner workspace">
          <div class="primary-column">
            <section class="scanner-panel" aria-label="Camera scanner">
              <div class="camera-stage" data-role="camera-stage">
                <video data-role="video" playsinline autoplay muted></video>
                <canvas class="overlay" data-role="overlay"></canvas>
                <div class="guide" aria-hidden="true"><span></span></div>
                <div class="camera-empty" data-role="camera-empty">Camera idle. Start scanner when ready.</div>
              </div>
              <div class="camera-toolbar">
                <div class="button-row">
                  <button class="btn primary" data-action="start" type="button">Start Scanner</button>
                  <button class="btn" data-action="scan-again" type="button" hidden>Scan Again</button>
                  <button class="btn ghost" data-action="stop" type="button" hidden>Stop Camera</button>
                </div>
                <div class="status-pill" data-role="status">Ready</div>
                <div class="capability-pills" data-role="capabilities"></div>
                <button class="icon-btn history-trigger" data-action="toggle-history" type="button" aria-label="Open recent scans" title="Recent scans">
                  ${icon("list")}
                </button>
              </div>
            </section>

            <details class="controls-panel" data-role="camera-controls">
              <summary>Camera controls</summary>
              <div class="controls-grid">
                <label class="control" data-role="zoom-control" hidden>
                  Zoom
                  <input data-action="zoom" type="range" min="1" max="1" step="0.1" value="1" />
                </label>
                <label class="control" data-role="torch-control" hidden>
                  Torch
                  <button class="btn ghost" data-action="torch" type="button">Off</button>
                </label>
                <label class="control">
                  Decode brightness
                  <input data-action="brightness" type="range" min="-40" max="60" step="1" value="0" />
                </label>
                <label class="control">
                  Decode contrast
                  <input data-action="contrast" type="range" min="0.8" max="1.8" step="0.05" value="1" />
                </label>
                <div class="control">
                  Reset
                  <button class="btn ghost" data-action="reset-camera" type="button">Reset Camera</button>
                </div>
              </div>
            </details>

            <section class="result-panel" aria-label="Latest result">
              <div class="result-value muted" data-role="result">No result yet.</div>
              <div class="result-meta" data-role="result-meta"></div>
              <div class="result-actions">
                <button class="icon-btn" data-action="copy-selected" type="button" hidden aria-label="Copy selected result" title="Copy">
                  ${icon("copy")}
                </button>
                <button class="icon-btn" data-action="open-selected" type="button" hidden aria-label="Open selected result" title="Open">
                  ${icon("open")}
                </button>
                <button class="icon-btn" data-action="delete-selected" type="button" hidden aria-label="Delete selected result" title="Delete">
                  ${icon("trash")}
                </button>
              </div>
            </section>
          </div>

          <aside class="history-panel" data-role="history-drawer" data-state="closed" aria-label="Recent scans" aria-hidden="true">
            <div class="drawer-actions">
              <button class="icon-btn" data-action="close-history" type="button" aria-label="Close recent scans" title="Close">
                ${icon("close")}
              </button>
              <button class="icon-btn danger" data-action="clear-history" type="button" aria-label="Clear all scans" title="Clear all">
                ${icon("trash")}
              </button>
            </div>
            <div class="history-list" data-role="history"></div>
          </aside>
        </section>
      </div>
      <canvas class="processing-canvas" data-role="processing"></canvas>
    </main>
  `;

  const state: ScannerState = {
    stream: null,
    track: null,
    capabilities: emptyCapabilities,
    scanning: false,
    scanInFlight: false,
    currentZoom: 1,
    torch: false,
    brightness: 0,
    contrast: 1,
    lastScanAt: 0,
    lastZoomAttemptAt: 0,
    selectedValue: null,
    latestValue: null,
    rafId: null,
    autoControlEnabled: true,
    historyDrawerOpen: false,
    swipeStartX: null,
  };

  const video = requireElement<HTMLVideoElement>(root, "[data-role='video']");
  const cameraStage = requireElement<HTMLElement>(root, "[data-role='camera-stage']");
  const overlayCanvas = requireElement<HTMLCanvasElement>(root, "[data-role='overlay']");
  const processingCanvas = requireElement<HTMLCanvasElement>(root, "[data-role='processing']");
  const status = requireElement<HTMLElement>(root, "[data-role='status']");
  const cameraEmpty = requireElement<HTMLElement>(root, "[data-role='camera-empty']");
  const result = requireElement<HTMLElement>(root, "[data-role='result']");
  const resultMeta = requireElement<HTMLElement>(root, "[data-role='result-meta']");
  const historyList = requireElement<HTMLElement>(root, "[data-role='history']");
  const capabilityPills = requireElement<HTMLElement>(root, "[data-role='capabilities']");
  const startButton = requireElement<HTMLButtonElement>(root, "[data-action='start']");
  const scanAgainButton = requireElement<HTMLButtonElement>(root, "[data-action='scan-again']");
  const stopButton = requireElement<HTMLButtonElement>(root, "[data-action='stop']");
  const copyButton = requireElement<HTMLButtonElement>(root, "[data-action='copy-selected']");
  const openButton = requireElement<HTMLButtonElement>(root, "[data-action='open-selected']");
  const deleteButton = requireElement<HTMLButtonElement>(root, "[data-action='delete-selected']");
  const clearButton = requireElement<HTMLButtonElement>(root, "[data-action='clear-history']");
  const toggleHistoryButton = requireElement<HTMLButtonElement>(root, "[data-action='toggle-history']");
  const closeHistoryButton = requireElement<HTMLButtonElement>(root, "[data-action='close-history']");
  const historyDrawer = requireElement<HTMLElement>(root, "[data-role='history-drawer']");
  const zoomControl = requireElement<HTMLElement>(root, "[data-role='zoom-control']");
  const zoomInput = requireElement<HTMLInputElement>(root, "[data-action='zoom']");
  const torchControl = requireElement<HTMLElement>(root, "[data-role='torch-control']");
  const torchButton = requireElement<HTMLButtonElement>(root, "[data-action='torch']");
  const brightnessInput = requireElement<HTMLInputElement>(root, "[data-action='brightness']");
  const contrastInput = requireElement<HTMLInputElement>(root, "[data-action='contrast']");
  const resetCameraButton = requireElement<HTMLButtonElement>(root, "[data-action='reset-camera']");
  const controlsPanel = requireElement<HTMLDetailsElement>(root, "[data-role='camera-controls']");

  let history = safeReadHistory(storage);
  let nativeDetector: Promise<BarcodeDetectorLike | null> | null = null;

  renderHistory();
  renderSelectedResult(null);

  startButton.addEventListener("click", () => {
    void startCamera();
  });

  scanAgainButton.addEventListener("click", () => {
    resumeScanning();
  });

  stopButton.addEventListener("click", () => {
    stopCamera("Camera stopped.");
  });

  toggleHistoryButton.addEventListener("click", () => {
    setHistoryDrawer(!state.historyDrawerOpen);
  });

  closeHistoryButton.addEventListener("click", () => {
    setHistoryDrawer(false);
  });

  clearButton.addEventListener("click", () => {
    clearStoredHistory(storage);
    history = [];
    state.selectedValue = null;
    renderHistory();
    renderSelectedResult(state.latestValue);
  });

  cameraStage.addEventListener("pointerup", (event) => {
    void handleCameraStagePress(event);
  });

  root.addEventListener("pointerdown", (event) => {
    state.swipeStartX = event.clientX;
  });

  root.addEventListener("pointerup", (event) => {
    if (state.swipeStartX === null) {
      return;
    }

    const deltaX = event.clientX - state.swipeStartX;
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth;
    if (!state.historyDrawerOpen && state.swipeStartX > viewportWidth - 28 && deltaX < -42) {
      setHistoryDrawer(true);
    } else if (state.historyDrawerOpen && deltaX > 42) {
      setHistoryDrawer(false);
    }
    state.swipeStartX = null;
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !state.historyDrawerOpen) {
      return;
    }

    if (historyDrawer.contains(target) || toggleHistoryButton.contains(target)) {
      return;
    }

    setHistoryDrawer(false);
  });

  copyButton.addEventListener("click", () => {
    void copySelectedValue();
  });

  openButton.addEventListener("click", () => {
    const selected = getSelectedValue();
    if (!selected) {
      return;
    }

    const classified = classifyScanValue(selected);
    if (classified.kind === "url") {
      openUrl(classified.href);
    }
  });

  deleteButton.addEventListener("click", () => {
    const selected = getSelectedValue();
    if (!selected) {
      return;
    }

    history = deleteScanFromHistory(history, selected);
    safeWriteHistory(storage, history);
    state.selectedValue = null;
    if (state.latestValue === selected) {
      state.latestValue = null;
    }
    renderHistory();
    renderSelectedResult(null);
    setStatus("Deleted selected scan.");
  });

  zoomInput.addEventListener("input", () => {
    disableAutoControl("Manual camera control active.");
    void applyZoom(Number(zoomInput.value));
  });

  torchButton.addEventListener("click", () => {
    disableAutoControl("Manual camera control active.");
    void applyTorch(!state.torch);
  });

  brightnessInput.addEventListener("input", () => {
    disableAutoControl("Manual camera control active.");
    state.brightness = Number(brightnessInput.value);
  });

  contrastInput.addEventListener("input", () => {
    disableAutoControl("Manual camera control active.");
    state.contrast = Number(contrastInput.value);
  });

  resetCameraButton.addEventListener("click", () => {
    disableAutoControl("Manual camera control active.");
    state.brightness = 0;
    state.contrast = 1;
    brightnessInput.value = "0";
    contrastInput.value = "1";
    void applyTorch(false);
    void applyZoom(state.capabilities.zoom.min);
    setStatus("Camera controls reset.");
  });

  controlsPanel.addEventListener("toggle", () => {
    if (controlsPanel.open) {
      disableAutoControl("Manual camera control active.");
    }
  });

  async function startCamera(): Promise<void> {
    if (!mediaDevices?.getUserMedia) {
      setStatus("Camera API unavailable in this browser or context.");
      cameraEmpty.textContent = "Camera API unavailable. History remains usable.";
      return;
    }

    startButton.disabled = true;
    setStatus("Requesting camera permission...");

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      await useCameraStream(stream);
    } catch (error) {
      try {
        const fallbackStream = await mediaDevices.getUserMedia({ audio: false, video: true });
        await useCameraStream(fallbackStream);
      } catch {
        const name = error instanceof DOMException ? error.name : "CameraError";
        setStatus(`${name}: camera permission denied or no camera found.`);
        cameraEmpty.textContent = "Camera unavailable. Check browser permission and HTTPS.";
        startButton.disabled = false;
      }
    }
  }

  async function useCameraStream(stream: MediaStream): Promise<void> {
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    if (!state.track) {
      stopCamera("No video track found.");
      startButton.disabled = false;
      return;
    }

    const rawCapabilities = readTrackCapabilities(state.track);
    state.capabilities = normalizeCameraCapabilities(rawCapabilities);
    state.currentZoom = state.capabilities.zoom.min;
    if (state.autoControlEnabled) {
      await applyTrackConstraints();
    }

    video.srcObject = stream;
    await video.play().catch(() => undefined);
    resizeCanvases();

    cameraEmpty.hidden = true;
    startButton.hidden = true;
    startButton.disabled = false;
    scanAgainButton.hidden = true;
    stopButton.hidden = false;
    renderCapabilities();
    setStatus("Scanning. Point camera at QR code.");
    state.scanning = true;
    state.lastScanAt = 0;
    state.lastZoomAttemptAt = performance.now();
    scheduleLoop();
  }

  function scheduleLoop(): void {
    if (state.rafId !== null) {
      cancelFrame(state.rafId);
    }
    state.rafId = requestFrame(loop);
  }

  function loop(timestamp: number): void {
    if (!state.scanning) {
      state.rafId = null;
      return;
    }

    if (!state.scanInFlight && shouldScanFrame(state.lastScanAt, timestamp)) {
      state.lastScanAt = timestamp;
      state.scanInFlight = true;
      void runScanTick(timestamp).finally(() => {
        state.scanInFlight = false;
      });
    }

    state.rafId = requestFrame(loop);
  }

  async function runScanTick(timestamp: number): Promise<void> {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    resizeCanvases();
    const detected = await detectQr();
    if (detected) {
      handleDetected(detected);
      return;
    }

    await maybeAutoZoom(timestamp);
  }

  async function detectQr(): Promise<DetectedQr | null> {
    const processingCtx = getCanvasContext(processingCanvas);
    if (!processingCtx) {
      setStatus("Canvas processing unavailable in this browser.");
      return null;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    processingCanvas.width = width;
    processingCanvas.height = height;
    processingCtx.drawImage(video, 0, 0, width, height);

    const fullFrame = await detectCanvas(processingCanvas, 0, 0);
    if (fullFrame) {
      return fullFrame;
    }

    const cropSize = Math.round(Math.min(width, height) * 0.68);
    const sourceX = Math.round((width - cropSize) / 2);
    const sourceY = Math.round((height - cropSize) / 2);
    processingCanvas.width = cropSize;
    processingCanvas.height = cropSize;
    processingCtx.drawImage(video, sourceX, sourceY, cropSize, cropSize, 0, 0, cropSize, cropSize);

    const cropFrame = await detectCanvas(processingCanvas, sourceX, sourceY);
    if (cropFrame) {
      return cropFrame;
    }

    const imageData = processingCtx.getImageData(0, 0, cropSize, cropSize);
    const enhanced = enhanceImageData(imageData, {
      brightness: Math.max(state.brightness, 18),
      contrast: Math.max(state.contrast, 1.35),
    });
    processingCtx.putImageData(enhanced, 0, 0);

    return detectCanvas(processingCanvas, sourceX, sourceY);
  }

  async function detectCanvas(canvas: HTMLCanvasElement, offsetX: number, offsetY: number): Promise<DetectedQr | null> {
    const detector = await getNativeDetector();
    if (detector) {
      const detected = await detector.detect(canvas).catch(() => []);
      const first = detected[0];
      if (first?.rawValue) {
        return {
          value: first.rawValue,
          points: mapNativePoints(first, offsetX, offsetY),
        };
      }
    }

    const processingCtx = getCanvasContext(processingCanvas);
    if (!processingCtx) {
      return null;
    }

    const imageData = processingCtx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });

    if (!code) {
      return null;
    }

    return {
      value: code.data,
      points: [
        code.location.topLeftCorner,
        code.location.topRightCorner,
        code.location.bottomRightCorner,
        code.location.bottomLeftCorner,
      ].map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })),
    };
  }

  async function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
    nativeDetector ??= createNativeDetector();
    return nativeDetector;
  }

  async function createNativeDetector(): Promise<BarcodeDetectorLike | null> {
    const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!ctor) {
      return null;
    }

    const supportedFormats: string[] | undefined = await ctor.getSupportedFormats?.().catch(() => []);
    if (supportedFormats && supportedFormats.length > 0 && !supportedFormats.includes("qr_code")) {
      return null;
    }

    return new ctor({ formats: ["qr_code"] });
  }

  function handleDetected(detected: DetectedQr): void {
    drawBoundingBox(detected.points);
    state.scanning = false;
    state.latestValue = detected.value;
    state.selectedValue = detected.value;
    history = addScanToHistory(history, detected.value, now());
    safeWriteHistory(storage, history);
    renderHistory();
    renderSelectedResult(detected.value);
    scanAgainButton.hidden = false;
    setStatus("Scan complete. Review result or scan again.");
  }

  function resumeScanning(): void {
    if (!state.stream) {
      void startCamera();
      return;
    }

    clearOverlay();
    state.scanning = true;
    state.lastScanAt = 0;
    state.lastZoomAttemptAt = performance.now();
    scanAgainButton.hidden = true;
    setStatus("Scanning. Point camera at QR code.");
    if (state.autoControlEnabled) {
      void applyZoom(state.capabilities.zoom.min);
    }
    scheduleLoop();
  }

  async function maybeAutoZoom(timestamp: number): Promise<void> {
    if (!state.autoControlEnabled || !state.capabilities.zoom.supported) {
      return;
    }

    const elapsed = timestamp - state.lastZoomAttemptAt;
    const nextZoom = getNextAutoZoom({
      elapsedSinceDecodeMs: elapsed,
      currentZoom: state.currentZoom,
      minZoom: state.capabilities.zoom.min,
      maxZoom: state.capabilities.zoom.max,
      step: Math.max(state.capabilities.zoom.step, 0.1),
    });

    if (nextZoom === null) {
      return;
    }

    state.lastZoomAttemptAt = timestamp;
    await applyZoom(nextZoom);
    setStatus(`Scanning. Auto zoom ${nextZoom.toFixed(1)}x.`);
  }

  async function applyTrackConstraints(): Promise<void> {
    if (!state.track) {
      return;
    }

    await state.track
      .applyConstraints(buildSupportedConstraints(state.capabilities) as MediaTrackConstraints)
      .catch(() => undefined);
  }

  async function applyZoom(zoom: number): Promise<void> {
    if (!state.track || !state.capabilities.zoom.supported) {
      return;
    }

    const nextZoom = clampZoom(state.capabilities, zoom);
    await state.track
      .applyConstraints(buildSupportedConstraints(state.capabilities, { zoom: nextZoom }) as MediaTrackConstraints)
      .then(() => {
        state.currentZoom = nextZoom;
        zoomInput.value = String(nextZoom);
      })
      .catch(() => undefined);
  }

  async function applyTorch(torch: boolean): Promise<void> {
    if (!state.track || !state.capabilities.torch) {
      return;
    }

    await state.track
      .applyConstraints(buildSupportedConstraints(state.capabilities, { torch }) as MediaTrackConstraints)
      .then(() => {
        state.torch = torch;
        torchButton.textContent = torch ? "On" : "Off";
      })
      .catch(() => undefined);
  }

  async function handleCameraStagePress(event: PointerEvent): Promise<void> {
    if (!state.stream) {
      return;
    }

    disableAutoControl("Manual focus active. Tap again anytime to rescan.");
    await applyFocusAtPoint(event.clientX, event.clientY);

    if (!state.scanning) {
      resumeScanning();
    }
  }

  async function applyFocusAtPoint(clientX: number, clientY: number): Promise<void> {
    if (!state.track) {
      return;
    }

    const rect = cameraStage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const point = {
      x: clampNumber((clientX - rect.left) / rect.width, 0, 1),
      y: clampNumber((clientY - rect.top) / rect.height, 0, 1),
    };

    await state.track
      .applyConstraints({
        advanced: [{ focusMode: "single-shot" }, { pointsOfInterest: [point] }],
      } as unknown as MediaTrackConstraints)
      .catch(() => undefined);
  }

  function disableAutoControl(message: string): void {
    state.autoControlEnabled = false;
    root.querySelector(".app")?.setAttribute("data-auto-control", "off");
    setStatus(message);
  }

  function setHistoryDrawer(open: boolean): void {
    state.historyDrawerOpen = open;
    historyDrawer.dataset.state = open ? "open" : "closed";
    historyDrawer.setAttribute("aria-hidden", String(!open));
    toggleHistoryButton.setAttribute("aria-expanded", String(open));
    toggleHistoryButton.setAttribute("aria-label", open ? "Close recent scans" : "Open recent scans");
  }

  function stopCamera(message: string): void {
    state.scanning = false;
    state.scanInFlight = false;
    if (state.rafId !== null) {
      cancelFrame(state.rafId);
      state.rafId = null;
    }
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.track = null;
    video.srcObject = null;
    startButton.hidden = false;
    startButton.disabled = false;
    stopButton.hidden = true;
    scanAgainButton.hidden = true;
    cameraEmpty.hidden = false;
    cameraEmpty.textContent = "Camera idle. Start scanner when ready.";
    state.capabilities = emptyCapabilities;
    renderCapabilities();
    clearOverlay();
    setStatus(message);
  }

  function renderHistory(): void {
    historyList.replaceChildren();

    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No cached scans yet.";
      historyList.append(empty);
      return;
    }

    for (const item of history) {
      const row = document.createElement("div");
      row.className = item.value === state.selectedValue ? "history-item active" : "history-item";

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "history-select";
      selectButton.dataset.historyValue = item.value;
      const value = document.createElement("span");
      value.className = "history-value";
      value.textContent = item.value;

      const meta = document.createElement("span");
      meta.className = "history-meta";
      meta.textContent = `${item.scanCount} scan${item.scanCount === 1 ? "" : "s"} · ${formatTime(item.lastScannedAt)}`;

      selectButton.append(value, meta);
      selectButton.addEventListener("click", () => {
        state.selectedValue = item.value;
        renderHistory();
        renderSelectedResult(item.value);
      });

      const actions = document.createElement("div");
      actions.className = "history-actions";
      actions.append(
        createHistoryActionButton("copy", item.value, "Copy scan", icon("copy"), () => {
          void copyValue(item.value);
        }),
      );

      if (classifyScanValue(item.value).kind === "url") {
        actions.append(
          createHistoryActionButton("open", item.value, "Open scan", icon("open"), () => {
            const classified = classifyScanValue(item.value);
            if (classified.kind === "url") {
              openUrl(classified.href);
            }
          }),
        );
      }

      actions.append(
        createHistoryActionButton("delete", item.value, "Delete scan", icon("trash"), () => {
          deleteHistoryValue(item.value);
        }),
      );

      row.append(selectButton, actions);
      historyList.append(row);
    }
  }

  function renderSelectedResult(value: string | null): void {
    const selected = value ?? getSelectedValue();
    copyButton.hidden = !selected;
    openButton.hidden = true;
    deleteButton.hidden = !selected;

    if (!selected) {
      result.classList.add("muted");
      result.textContent = "No result yet.";
      resultMeta.textContent = "";
      return;
    }

    const classified = classifyScanValue(selected);
    result.classList.remove("muted");
    result.textContent = selected;

    if (classified.kind === "url") {
      openButton.hidden = false;
      resultMeta.textContent = `Safe URL: ${classified.host}`;
    } else {
      resultMeta.textContent = "Text result";
    }
  }

  async function copySelectedValue(): Promise<void> {
    const selected = getSelectedValue();
    if (!selected) {
      return;
    }

    await copyValue(selected);
  }

  async function copyValue(value: string): Promise<void> {
    await clipboard
      ?.writeText(value)
      .then(() => setStatus("Copied result."))
      .catch(() => {
        result.focus();
        setStatus("Copy blocked. Select the result text manually.");
      });
  }

  function deleteHistoryValue(value: string): void {
    history = deleteScanFromHistory(history, value);
    safeWriteHistory(storage, history);
    if (state.selectedValue === value) {
      state.selectedValue = null;
    }
    if (state.latestValue === value) {
      state.latestValue = null;
    }
    renderHistory();
    renderSelectedResult(null);
    setStatus("Deleted selected scan.");
  }

  function getSelectedValue(): string | null {
    return state.selectedValue ?? state.latestValue;
  }

  function renderCapabilities(): void {
    capabilityPills.replaceChildren();
    const pills: string[] = [];

    if (state.capabilities.zoom.supported) {
      pills.push("Zoom");
      zoomControl.hidden = false;
      zoomInput.min = String(state.capabilities.zoom.min);
      zoomInput.max = String(state.capabilities.zoom.max);
      zoomInput.step = String(state.capabilities.zoom.step);
      zoomInput.value = String(state.currentZoom);
    } else {
      zoomControl.hidden = true;
    }

    if (state.capabilities.focusContinuous) {
      pills.push("Focus");
    }
    if (state.capabilities.exposureContinuous) {
      pills.push("Exposure");
    }
    if (state.capabilities.whiteBalanceContinuous) {
      pills.push("White balance");
    }
    if (state.capabilities.torch) {
      pills.push("Torch");
      torchControl.hidden = false;
    } else {
      torchControl.hidden = true;
    }

    for (const pill of pills.length ? pills : ["Basic camera"]) {
      const item = document.createElement("span");
      item.textContent = pill;
      capabilityPills.append(item);
    }
  }

  function resizeCanvases(): void {
    const width = video.videoWidth || overlayCanvas.clientWidth || 640;
    const height = video.videoHeight || overlayCanvas.clientHeight || 480;
    if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
      overlayCanvas.width = width;
      overlayCanvas.height = height;
    }
  }

  function drawBoundingBox(points: Array<{ x: number; y: number }>): void {
    clearOverlay();
    const overlayCtx = getCanvasContext(overlayCanvas);
    if (!overlayCtx) {
      return;
    }

    if (points.length < 4) {
      return;
    }

    overlayCtx.beginPath();
    overlayCtx.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);
    for (const point of points.slice(1)) {
      overlayCtx.lineTo(point.x, point.y);
    }
    overlayCtx.closePath();
    overlayCtx.lineWidth = Math.max(4, overlayCanvas.width * 0.006);
    overlayCtx.strokeStyle = "#22c55e";
    overlayCtx.shadowColor = "rgba(34, 197, 94, 0.8)";
    overlayCtx.shadowBlur = 12;
    overlayCtx.stroke();
    overlayCtx.shadowBlur = 0;
  }

  function clearOverlay(): void {
    const overlayCtx = getCanvasContext(overlayCanvas);
    overlayCtx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function safeReadHistory(store: HistoryStore): ScanHistoryItem[] {
    try {
      return readStoredHistory(store);
    } catch {
      setStatus("Storage unavailable. Using temporary history.");
      return [];
    }
  }

  function safeWriteHistory(store: HistoryStore, items: ScanHistoryItem[]): void {
    try {
      writeStoredHistory(store, items);
    } catch {
      setStatus("Storage unavailable. Result kept for this session only.");
    }
  }

  function readTrackCapabilities(track: MediaStreamTrack): RawCameraCapabilities {
    if (typeof track.getCapabilities !== "function") {
      return {};
    }

    return track.getCapabilities() as RawCameraCapabilities;
  }
}

function mapNativePoints(result: BarcodeDetectorResult, offsetX: number, offsetY: number): Array<{ x: number; y: number }> {
  if (result.cornerPoints?.length) {
    return result.cornerPoints.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
  }

  const box = result.boundingBox;
  if (!box) {
    return [];
  }

  return [
    { x: box.x + offsetX, y: box.y + offsetY },
    { x: box.x + box.width + offsetX, y: box.y + offsetY },
    { x: box.x + box.width + offsetX, y: box.y + box.height + offsetY },
    { x: box.x + offsetX, y: box.y + box.height + offsetY },
  ];
}

function createBrowserStore(): HistoryStore {
  try {
    if (globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return createMemoryStore();
  }

  return createMemoryStore();
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function createHistoryActionButton(
  action: "copy" | "open" | "delete",
  value: string,
  label: string,
  iconMarkup: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action === "delete" ? "icon-btn danger" : "icon-btn";
  button.dataset.historyAction = action;
  button.dataset.historyValue = value;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = iconMarkup;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function icon(name: "copy" | "open" | "trash" | "list" | "close"): string {
  const paths: Record<typeof name, string> = {
    copy: '<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"/>',
    open: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/><path d="M15 3h6v6"/><path d="M5 5h5"/><path d="M5 5v14h14v-5"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (import.meta.env.MODE === "test") {
    return null;
  }

  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function formatTime(isoTime: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(new Date(isoTime));
}

if (import.meta.env.MODE !== "test") {
  const root = document.getElementById("app");
  if (root) {
    createScannerApp(root);
  }
}
