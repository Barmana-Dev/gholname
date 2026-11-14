import { describe, expect, it } from "vitest";
import {
  citiesForProvince,
  provinces,
  sectionsForCity,
} from "./locations";

describe("offline registry locations", () => {
  it("ships all provinces locally and exposes Isfahan cities", () => {
    expect(provinces).toHaveLength(31);
    expect(citiesForProvince("اصفهان").map((item) => item.label)).toContain(
      "اصفهان",
    );
  });

  it("cascades registry sections from the selected city", () => {
    expect(sectionsForCity("اصفهان", "اصفهان")).toContain("مرکزی");
    expect(sectionsForCity("اصفهان", "شهر ناموجود")).toEqual([]);
  });
});
