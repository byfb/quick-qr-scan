export interface PixelAdjustments {
  brightness: number;
  contrast: number;
}

export function adjustPixels(source: Uint8ClampedArray, adjustments: PixelAdjustments): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source);
  const { brightness, contrast } = adjustments;

  for (let index = 0; index < output.length; index += 4) {
    output[index] = adjustChannel(output[index] ?? 0, brightness, contrast);
    output[index + 1] = adjustChannel(output[index + 1] ?? 0, brightness, contrast);
    output[index + 2] = adjustChannel(output[index + 2] ?? 0, brightness, contrast);
  }

  return output;
}

export function enhanceImageData(imageData: ImageData, adjustments: PixelAdjustments): ImageData {
  const adjusted = new Uint8ClampedArray(adjustPixels(imageData.data, adjustments));
  return new ImageData(adjusted, imageData.width, imageData.height);
}

function adjustChannel(value: number, brightness: number, contrast: number): number {
  return clamp(Math.round((value - 128) * contrast + 128 + brightness));
}

function clamp(value: number): number {
  return Math.min(255, Math.max(0, value));
}
