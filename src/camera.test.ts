import { describe, expect, it } from "vitest";
import { buildSupportedConstraints, clampZoom, normalizeCameraCapabilities } from "./camera";

describe("camera capabilities", () => {
  it("normalizes zoom, torch, and continuous modes", () => {
    const caps = normalizeCameraCapabilities({
      zoom: { min: 1, max: 4, step: 0.25 },
      torch: true,
      focusMode: ["manual", "continuous"],
      exposureMode: ["continuous"],
      whiteBalanceMode: ["manual"],
    });

    expect(caps).toEqual({
      zoom: { supported: true, min: 1, max: 4, step: 0.25 },
      torch: true,
      focusContinuous: true,
      exposureContinuous: true,
      whiteBalanceContinuous: false,
    });
  });

  it("builds only constraints supported by the current track", () => {
    const constraints = buildSupportedConstraints(
      normalizeCameraCapabilities({
        zoom: { min: 1, max: 3, step: 0.5 },
        torch: true,
        focusMode: ["continuous"],
      }),
      { zoom: 9, torch: true },
    );

    expect(constraints).toEqual({
      advanced: [{ focusMode: "continuous" }, { zoom: 3 }, { torch: true }],
    });
  });

  it("clamps zoom to capability range", () => {
    const caps = normalizeCameraCapabilities({ zoom: { min: 1, max: 2, step: 0.1 } });

    expect(clampZoom(caps, 0.2)).toBe(1);
    expect(clampZoom(caps, 1.55)).toBe(1.6);
    expect(clampZoom(caps, 5)).toBe(2);
  });
});
