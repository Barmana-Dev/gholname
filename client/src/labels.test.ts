import { describe, expect, it } from "vitest";
import { fa, roleLabel } from "./labels";

describe("labels", () => {
  it("translates enum codes and keeps unknown codes visible", () => {
    expect(fa("received")).toBe("دریافت‌شده");
    expect(fa("registry_legal")).toBe("بررسی حقوقی ثبتی");
    expect(fa("something_new")).toBe("something_new");
    expect(fa(null)).toBe("");
  });
  it("translates roles", () => {
    expect(roleLabel("registry_expert")).toBe("کارشناس ثبتی");
  });
});
