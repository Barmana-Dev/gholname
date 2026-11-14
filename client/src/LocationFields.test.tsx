// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationFields } from "./LocationFields";

describe("LocationFields", () => {
  it("cascades city and registry section options locally", () => {
    const { container } = render(<LocationFields />);
    const province = container.querySelector(
      'select[name="province"]',
    ) as HTMLSelectElement;
    const city = container.querySelector(
      'select[name="county"]',
    ) as HTMLSelectElement;
    const section = container.querySelector(
      'select[name="registrySection"]',
    ) as HTMLSelectElement;
    expect(city.disabled).toBe(true);
    fireEvent.change(province, { target: { value: "اصفهان" } });
    expect(city.disabled).toBe(false);
    expect(
      Array.from(city.options).map((option) => option.value),
    ).toContain("کاشان");
    fireEvent.change(city, { target: { value: "اصفهان" } });
    expect(section.disabled).toBe(false);
    expect(
      Array.from(section.options).map((option) => option.value),
    ).toContain("مرکزی");
  });
});
