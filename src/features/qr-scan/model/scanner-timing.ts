export const SCAN_INTERVAL_MS = 83;
export const AUTO_ZOOM_DELAY_MS = 1_200;

export interface AutoZoomRequest {
  elapsedSinceDecodeMs: number;
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
  step: number;
}

export function shouldScanFrame(lastScanAtMs: number, nowMs: number): boolean {
  return nowMs - lastScanAtMs >= SCAN_INTERVAL_MS;
}

export function getNextAutoZoom(request: AutoZoomRequest): number | null {
  if (request.elapsedSinceDecodeMs < AUTO_ZOOM_DELAY_MS || request.currentZoom >= request.maxZoom) {
    return null;
  }

  const next = Math.max(request.minZoom, request.currentZoom + request.step);
  return Math.min(request.maxZoom, Number(next.toFixed(decimalPlaces(request.step))));
}

function decimalPlaces(value: number): number {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1]?.length ?? 0 : 0;
}
