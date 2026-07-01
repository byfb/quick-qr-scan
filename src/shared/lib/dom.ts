export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

export function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (import.meta.env.MODE === "test") {
    return null;
  }

  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}
