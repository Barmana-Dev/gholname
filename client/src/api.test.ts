import { describe, expect, it } from "vitest";
import { formatDate } from "./api";

describe("formatDate", () => {
  it("does not crash management panels on missing or invalid timestamps", () => {
    expect(formatDate()).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});
