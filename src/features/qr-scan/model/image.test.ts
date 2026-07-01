import { describe, expect, it } from "vitest";
import { adjustPixels } from "..";

describe("adjustPixels", () => {
  it("applies brightness and contrast while preserving alpha", () => {
    const source = new Uint8ClampedArray([100, 120, 140, 255, 0, 20, 40, 128]);

    const adjusted = adjustPixels(source, { brightness: 20, contrast: 1.2 });

    expect(Array.from(adjusted)).toEqual([114, 138, 162, 255, 0, 18, 42, 128]);
  });

  it("clamps channel values", () => {
    const source = new Uint8ClampedArray([250, 5, 125, 255]);

    const adjusted = adjustPixels(source, { brightness: 30, contrast: 2 });

    expect(Array.from(adjusted)).toEqual([255, 0, 152, 255]);
  });
});
