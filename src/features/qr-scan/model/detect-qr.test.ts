import { describe, expect, it, vi } from "vitest";
import { decodeWithJsQrFallback } from "./detect-qr";

describe("decodeWithJsQrFallback", () => {
  it("loads jsQR only when fallback decoding is requested", async () => {
    const loadJsQr = vi.fn(async () => () => null);
    const imageData = {
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
    } as ImageData;

    await decodeWithJsQrFallback(imageData, loadJsQr);

    expect(loadJsQr).toHaveBeenCalledTimes(1);
  });
});
