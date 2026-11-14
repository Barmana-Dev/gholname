import { describe, expect, it } from "vitest";
import {
  displayPersianDate,
  gregorianToJalali,
  jalaliToGregorian,
  parsePersianDate,
} from "./persian-date";

describe("offline Persian calendar conversion", () => {
  it("converts the Persian new year without a remote calendar", () => {
    expect(jalaliToGregorian(1403, 1, 1)).toBe("2024-03-20");
    expect(jalaliToGregorian(1403, 12, 30)).toBe("2025-03-20");
    expect(jalaliToGregorian(1399, 12, 30)).toBe("2021-03-20");
    expect(jalaliToGregorian(1400, 1, 1)).toBe("2021-03-21");
    expect(gregorianToJalali("2024-03-20")).toBe("1403/01/01");
  });

  it("accepts Persian digits and preserves the local date-time contract", () => {
    expect(parsePersianDate("۱۴۰۳/۰۱/۰۱")).toBe("2024-03-20");
    expect(parsePersianDate("۱۴۰۳/۰۱/۰۱ ۱۲:۳۰", true)).toBe(
      "2024-03-20T12:30",
    );
    expect(displayPersianDate("2024-03-20T12:30", true)).toBe(
      "۱۴۰۳/۰۱/۰۱ ۱۲:۳۰",
    );
  });

  it("rejects impossible Jalali dates", () => {
    expect(parsePersianDate("۱۴۰۳/۰۲/۳۲")).toBeNull();
    expect(parsePersianDate("۱۴۰۲/۱۲/۳۰")).toBeNull();
    expect(parsePersianDate("۱۴۰۳/۰۱/۰۱", true)).toBeNull();
  });
});
