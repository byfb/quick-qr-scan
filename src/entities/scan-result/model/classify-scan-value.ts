export type ClassifiedScanValue =
  | {
      kind: "url";
      value: string;
      href: string;
      host: string;
    }
  | {
      kind: "text";
      value: string;
    };

export function classifyScanValue(value: string): ClassifiedScanValue {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return {
        kind: "url",
        value,
        href: url.href,
        host: url.host,
      };
    }
  } catch {
    return { kind: "text", value };
  }

  return { kind: "text", value };
}
