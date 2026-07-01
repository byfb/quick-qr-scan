import type jsQR from "jsqr";

export type JsQrDecoder = typeof jsQR;
export type JsQrLoader = () => Promise<JsQrDecoder>;

export async function loadDefaultJsQr(): Promise<JsQrDecoder> {
  return (await import("jsqr")).default;
}

export async function decodeWithJsQrFallback(
  imageData: ImageData,
  loadJsQr: JsQrLoader = loadDefaultJsQr,
): Promise<ReturnType<JsQrDecoder>> {
  const decode = await loadJsQr();
  return decode(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
}
