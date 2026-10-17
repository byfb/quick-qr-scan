import { describe, expect, it } from "vitest";
import { classifyScanValue } from "..";

describe("classifyScanValue", () => {
  it("classifies HTTP and HTTPS values as URLs", () => {
    expect(classifyScanValue("https://example.com/path?q=1")).toMatchObject({
      kind: "url",
      href: "https://example.com/path?q=1",
      host: "example.com",
    });

    expect(classifyScanValue("http://example.test/item")).toMatchObject({
      kind: "url",
      href: "http://example.test/item",
      host: "example.test",
    });
  });

  it("treats non-http schemes as text", () => {
    expect(classifyScanValue("javascript:alert(1)")).toEqual({
      kind: "text",
      value: "javascript:alert(1)",
    });
    expect(classifyScanValue("mailto:help@example.com")).toEqual({
      kind: "text",
      value: "mailto:help@example.com",
    });
  });

  it("keeps raw text for invalid or ordinary values", () => {
    expect(classifyScanValue("ASSET 42")).toEqual({ kind: "text", value: "ASSET 42" });
  });
});
