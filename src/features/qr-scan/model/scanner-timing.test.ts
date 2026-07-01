import { describe, expect, it } from "vitest";
import { SCAN_INTERVAL_MS, getNextAutoZoom, shouldScanFrame } from "..";

describe("scanner timing", () => {
  it("throttles scan work to about 12 fps", () => {
    expect(SCAN_INTERVAL_MS).toBe(83);
    expect(shouldScanFrame(1_000, 1_050)).toBe(false);
    expect(shouldScanFrame(1_000, 1_083)).toBe(true);
  });

  it("steps auto zoom only after the delay", () => {
    expect(
      getNextAutoZoom({
        elapsedSinceDecodeMs: 1_100,
        currentZoom: 1,
        minZoom: 1,
        maxZoom: 4,
        step: 0.5,
      }),
    ).toBeNull();

    expect(
      getNextAutoZoom({
        elapsedSinceDecodeMs: 1_250,
        currentZoom: 1,
        minZoom: 1,
        maxZoom: 4,
        step: 0.5,
      }),
    ).toBe(1.5);
  });

  it("does not zoom beyond hardware max", () => {
    expect(
      getNextAutoZoom({
        elapsedSinceDecodeMs: 1_250,
        currentZoom: 4,
        minZoom: 1,
        maxZoom: 4,
        step: 0.5,
      }),
    ).toBeNull();
  });
});
