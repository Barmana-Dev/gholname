// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { safeDecode } from "./router";

describe("safeDecode", () => {
  it("decodes valid escapes", () => {
    expect(safeDecode("%D8%A7")).toBe("ا");
  });
  it("never throws on malformed percent-escapes", () => {
    expect(() => decodeURIComponent("%E0%A4%A")).toThrow(URIError);
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
