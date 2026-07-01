import {
  buildSupportedConstraints,
  clampZoom,
  decodeWithJsQrFallback,
  enhanceImageData,
  getNextAutoZoom,
  normalizeCameraCapabilities,
  shouldScanFrame,
  type JsQrLoader,
  type NormalizedCameraCapabilities,
  type RawCameraCapabilities,
} from "../../../features/qr-scan";
import {
  addScanToHistory,
  clearStoredHistory,
  createMemoryStore,
  deleteScanFromHistory,
  readStoredHistory,
  writeStoredHistory,
  type HistoryStore,
  type ScanHistoryItem,
} from "../../../entities/scan-history";
import { classifyScanValue } from "../../../entities/scan-result";
import { AUTO_OPEN_LINKS_KEY, readStoredBoolean } from "../../../features/open-scan-link";
import { clampNumber, formatTime, getCanvasContext, requireElement } from "../../../shared/lib";
import { icon } from "../../../shared/ui";

interface DetectedQr {
  value: string;
  points: Array<{ x: number; y: number }>;
}

interface ScannerAppDependencies {
  storage?: HistoryStore;
  mediaDevices?: MediaDevices;
  clipboard?: Pick<Clipboard, "writeText">;
  openUrl?: (href: string) => void;
  now?: () => Date;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  testDetections?: DetectedQr[];
  loadJsQr?: JsQrLoader;
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
  cameraStarting: boolean;
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
  autoOpenLinks: boolean;
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
  const testDetections = [...(dependencies.testDetections ?? [])];
  const loadJsQr = dependencies.loadJsQr;
  const initialAutoOpenLinks = readStoredBoolean(storage, AUTO_OPEN_LINKS_KEY);

  const state: ScannerState = {
    stream: null,
    track: null,
    capabilities: emptyCapabilities,
    scanning: false,
    scanInFlight: false,
    cameraStarting: false,
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
    autoOpenLinks: initialAutoOpenLinks,
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
  const modalRoot = requireElement<HTMLElement>(root, "[data-role='modal-root']");
  const historyList = requireElement<HTMLElement>(root, "[data-role='history']");
  const capabilityPills = requireElement<HTMLElement>(root, "[data-role='capabilities']");
  const stopButton = requireElement<HTMLButtonElement>(root, "[data-action='stop']");
  const copyButton = requireElement<HTMLButtonElement>(root, "[data-action='copy-selected']");
  const openButton = requireElement<HTMLButtonElement>(root, "[data-action='open-selected']");
  const deleteButton = requireElement<HTMLButtonElement>(root, "[data-action='delete-selected']");
  const clearButton = requireElement<HTMLButtonElement>(root, "[data-action='clear-history']");
  const toggleHistoryButton = requireElement<HTMLButtonElement>(root, "[data-action='toggle-history']");
  const closeHistoryButton = requireElement<HTMLButtonElement>(root, "[data-action='close-history']");
  const historyDrawer = requireElement<HTMLElement>(root, "[data-role='history-drawer']");
  const historyEdge = requireElement<HTMLElement>(root, "[data-role='history-edge']");
  const zoomControl = requireElement<HTMLElement>(root, "[data-role='zoom-control']");
  const zoomInput = requireElement<HTMLInputElement>(root, "[data-action='zoom']");
  const torchControl = requireElement<HTMLElement>(root, "[data-role='torch-control']");
  const torchButton = requireElement<HTMLButtonElement>(root, "[data-action='torch']");
  const brightnessInput = requireElement<HTMLInputElement>(root, "[data-action='brightness']");
  const contrastInput = requireElement<HTMLInputElement>(root, "[data-action='contrast']");
  const autoOpenLinksInput = requireElement<HTMLInputElement>(root, "[data-action='auto-open-links']");
  const resetCameraButton = requireElement<HTMLButtonElement>(root, "[data-action='reset-camera']");
  const controlsPanel = requireElement<HTMLDetailsElement>(root, "[data-role='camera-controls']");

  let history = safeReadHistory(storage);
  let nativeDetector: Promise<BarcodeDetectorLike | null> | null = null;

  renderHistory();
  renderSelectedResult(null);
  autoOpenLinksInput.checked = state.autoOpenLinks;
  renderCameraActionState();

  stopButton.addEventListener("click", () => {
    stopCamera("Camera stopped.");
  });

  toggleHistoryButton.addEventListener("click", () => {
    setHistoryDrawer(!state.historyDrawerOpen);
  });

  closeHistoryButton.addEventListener("click", () => {
    setHistoryDrawer(false);
  });

  historyEdge.addEventListener("pointerdown", (event) => {
    handleSwipeStart(event.clientX);
    historyEdge.setPointerCapture?.(event.pointerId);
  });

  historyEdge.addEventListener("pointermove", (event) => {
    handleSwipeMove(event.clientX, true);
  });

  historyEdge.addEventListener("pointerup", (event) => {
    handleSwipeEnd(event.clientX);
    historyEdge.releasePointerCapture?.(event.pointerId);
  });

  historyEdge.addEventListener(
    "touchstart",
    (event) => {
      handleSwipeStart(event.touches[0]?.clientX ?? null);
    },
    { passive: true },
  );

  historyEdge.addEventListener(
    "touchmove",
    (event) => {
      handleSwipeMove(event.touches[0]?.clientX ?? null, true);
    },
    { passive: true },
  );

  historyEdge.addEventListener("touchend", (event) => {
    handleSwipeEnd(event.changedTouches[0]?.clientX ?? null);
  });

  clearButton.addEventListener("click", () => {
    clearStoredHistory(storage);
    history = [];
    state.selectedValue = null;
    renderHistory();
    renderSelectedResult(state.latestValue);
  });

  cameraStage.addEventListener("click", () => {
    void activateCameraStage();
  });

  cameraStage.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    void activateCameraStage();
  });

  cameraStage.addEventListener("pointerup", (event) => {
    if (state.scanning) {
      void handleCameraStagePress(event);
    }
  });

  root.addEventListener("pointerdown", (event) => {
    handleSwipeStart(event.clientX);
  });

  root.addEventListener("pointerup", (event) => {
    handleSwipeEnd(event.clientX);
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

  autoOpenLinksInput.addEventListener("click", syncAutoOpenLinksSetting);
  autoOpenLinksInput.addEventListener("change", syncAutoOpenLinksSetting);

  function syncAutoOpenLinksSetting(): void {
    state.autoOpenLinks = autoOpenLinksInput.checked;
    safeWriteBoolean(storage, AUTO_OPEN_LINKS_KEY, state.autoOpenLinks);
    setStatus(state.autoOpenLinks ? "Auto-open links enabled." : "Auto-open links disabled.");
  }

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
    if (state.cameraStarting || state.stream) {
      return;
    }

    if (!mediaDevices?.getUserMedia) {
      setStatus("Camera API unavailable in this browser or context.");
      cameraEmpty.textContent = "Camera API unavailable. History remains usable.";
      return;
    }

    state.cameraStarting = true;
    renderCameraActionState();
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
        state.cameraStarting = false;
        renderCameraActionState();
      }
    }
  }

  async function activateCameraStage(): Promise<void> {
    if (!state.stream) {
      await startCamera();
      return;
    }

    if (!state.scanning) {
      resumeScanning();
    }
  }

  async function useCameraStream(stream: MediaStream): Promise<void> {
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    if (!state.track) {
      stopCamera("No video track found.");
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
    state.cameraStarting = false;
    state.scanning = true;
    stopButton.hidden = false;
    renderCameraActionState();
    renderCapabilities();
    setStatus("Scanning. Point camera at QR code.");
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
    if (testDetections.length === 0 && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
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
    const testDetection = testDetections.shift();
    if (testDetection) {
      return testDetection;
    }

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
    const code = await decodeWithJsQrFallback(imageData, loadJsQr);

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
    renderCameraActionState();
    handleDetectedLink(detected.value);
    setStatus("Scan complete. Tap camera view to scan again.");
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
    closeLinkPrompt();
    renderCameraActionState();
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
    disableAutoControl("Manual focus active. Tap again anytime to rescan.");
    await applyFocusAtPoint(event.clientX, event.clientY);
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
    historyEdge.dataset.state = open ? "open" : "closed";
    historyDrawer.setAttribute("aria-hidden", String(!open));
    toggleHistoryButton.setAttribute("aria-expanded", String(open));
    toggleHistoryButton.setAttribute("aria-label", open ? "Close recent scans" : "Open recent scans");
  }

  function handleSwipeStart(clientX: number | null): void {
    state.swipeStartX = clientX;
  }

  function handleSwipeMove(clientX: number | null, forceFromEdge = false): void {
    if (state.swipeStartX === null || clientX === null) {
      return;
    }

    const deltaX = clientX - state.swipeStartX;
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth;
    if (!state.historyDrawerOpen && (forceFromEdge || state.swipeStartX > viewportWidth - 44) && deltaX < -30) {
      setHistoryDrawer(true);
      state.swipeStartX = null;
    }
  }

  function handleSwipeEnd(clientX: number | null): void {
    if (state.swipeStartX === null || clientX === null) {
      state.swipeStartX = null;
      return;
    }

    const deltaX = clientX - state.swipeStartX;
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth;
    if (!state.historyDrawerOpen && state.swipeStartX > viewportWidth - 44 && deltaX < -30) {
      setHistoryDrawer(true);
    } else if (state.historyDrawerOpen && deltaX > 42) {
      setHistoryDrawer(false);
    }
    state.swipeStartX = null;
  }

  function stopCamera(message: string): void {
    state.scanning = false;
    state.scanInFlight = false;
    state.cameraStarting = false;
    if (state.rafId !== null) {
      cancelFrame(state.rafId);
      state.rafId = null;
    }
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.track = null;
    video.srcObject = null;
    stopButton.hidden = true;
    cameraEmpty.hidden = false;
    cameraEmpty.textContent = "Tap camera view to start.";
    state.capabilities = emptyCapabilities;
    closeLinkPrompt();
    renderCameraActionState();
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

  function handleDetectedLink(value: string): void {
    closeLinkPrompt();
    const classified = classifyScanValue(value);
    if (classified.kind !== "url") {
      return;
    }

    if (state.autoOpenLinks) {
      openUrl(classified.href);
      return;
    }

    showLinkPrompt(classified.href, classified.host);
  }

  function showLinkPrompt(href: string, host: string): void {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.dataset.role = "link-prompt";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "link-prompt-title");

    const panel = document.createElement("div");
    panel.className = "modal-panel";

    const title = document.createElement("h2");
    title.id = "link-prompt-title";
    title.textContent = "Open scanned link?";

    const body = document.createElement("p");
    body.textContent = host;

    const detail = document.createElement("div");
    detail.className = "modal-url";
    detail.textContent = href;

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const keepButton = document.createElement("button");
    keepButton.type = "button";
    keepButton.className = "btn ghost";
    keepButton.dataset.action = "dismiss-link-prompt";
    keepButton.textContent = "Keep result";
    keepButton.addEventListener("click", () => {
      closeLinkPrompt();
    });

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "btn primary";
    openButton.dataset.action = "confirm-open-link";
    openButton.textContent = "Open link";
    openButton.addEventListener("click", () => {
      closeLinkPrompt();
      openUrl(href);
    });

    actions.append(keepButton, openButton);
    panel.append(title, body, detail, actions);
    backdrop.append(panel);
    modalRoot.replaceChildren(backdrop);
    openButton.focus();
  }

  function closeLinkPrompt(): void {
    modalRoot.replaceChildren();
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

  function renderCameraActionState(): void {
    const cameraState = state.cameraStarting ? "starting" : state.scanning ? "scanning" : state.stream ? "complete" : "idle";
    cameraStage.dataset.state = cameraState;

    if (state.cameraStarting) {
      cameraStage.setAttribute("aria-label", "Starting scanner");
      cameraStage.setAttribute("aria-disabled", "true");
      cameraEmpty.textContent = "Starting camera...";
      return;
    }

    cameraStage.removeAttribute("aria-disabled");

    if (!state.stream) {
      cameraStage.setAttribute("aria-label", "Start scanner");
      cameraEmpty.textContent = "Tap camera view to start.";
      return;
    }

    if (state.scanning) {
      cameraStage.setAttribute("aria-label", "Scanner active");
      return;
    }

    cameraStage.setAttribute("aria-label", "Scan again");
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

  function safeWriteBoolean(store: HistoryStore, key: string, value: boolean): void {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch {
      setStatus("Storage unavailable. Setting kept for this session only.");
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
