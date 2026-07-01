export interface RawCameraCapabilities {
  zoom?: { min?: number; max?: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
}

export interface NormalizedCameraCapabilities {
  zoom: {
    supported: boolean;
    min: number;
    max: number;
    step: number;
  };
  torch: boolean;
  focusContinuous: boolean;
  exposureContinuous: boolean;
  whiteBalanceContinuous: boolean;
}

export interface CameraConstraintRequest {
  zoom?: number;
  torch?: boolean;
}

export interface ExtendedTrackConstraintSet {
  focusMode?: "continuous";
  exposureMode?: "continuous";
  whiteBalanceMode?: "continuous";
  zoom?: number;
  torch?: boolean;
}

export interface ExtendedMediaTrackConstraints {
  advanced?: ExtendedTrackConstraintSet[];
}

export function normalizeCameraCapabilities(caps: RawCameraCapabilities): NormalizedCameraCapabilities {
  const min = caps.zoom?.min ?? 1;
  const max = caps.zoom?.max ?? min;
  const step = caps.zoom?.step ?? 0.1;

  return {
    zoom: {
      supported: Boolean(caps.zoom && max > min),
      min,
      max,
      step,
    },
    torch: caps.torch === true,
    focusContinuous: caps.focusMode?.includes("continuous") ?? false,
    exposureContinuous: caps.exposureMode?.includes("continuous") ?? false,
    whiteBalanceContinuous: caps.whiteBalanceMode?.includes("continuous") ?? false,
  };
}

export function buildSupportedConstraints(
  caps: NormalizedCameraCapabilities,
  request: CameraConstraintRequest = {},
): ExtendedMediaTrackConstraints {
  const advanced: ExtendedTrackConstraintSet[] = [];

  if (caps.focusContinuous) {
    advanced.push({ focusMode: "continuous" });
  }
  if (caps.exposureContinuous) {
    advanced.push({ exposureMode: "continuous" });
  }
  if (caps.whiteBalanceContinuous) {
    advanced.push({ whiteBalanceMode: "continuous" });
  }
  if (caps.zoom.supported && typeof request.zoom === "number") {
    advanced.push({ zoom: clampZoom(caps, request.zoom) });
  }
  if (caps.torch && typeof request.torch === "boolean") {
    advanced.push({ torch: request.torch });
  }

  return advanced.length ? { advanced } : {};
}

export function clampZoom(caps: NormalizedCameraCapabilities, zoom: number): number {
  if (!caps.zoom.supported) {
    return caps.zoom.min;
  }

  const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom));
  const stepped = Math.round(clamped / caps.zoom.step) * caps.zoom.step;
  const precision = decimalPlaces(caps.zoom.step);
  return Number(stepped.toFixed(precision));
}

function decimalPlaces(value: number): number {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1]?.length ?? 0 : 0;
}
