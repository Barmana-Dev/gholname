// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructuredApplicationFields } from "./StructuredApplicationFields";

describe("StructuredApplicationFields", () => {
  it("normalizes Persian digits before serializing controlled fields", () => {
    const { container } = render(
      <StructuredApplicationFields code="land-apartment-subdivision" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "افزودن قطعه یا واحد" }));
    const inputs = container.querySelectorAll(".structured-row input");
    fireEvent.change(inputs[0], { target: { value: "قطعه ۱۲" } });
    fireEvent.change(inputs[2], { target: { value: "مسکونی" } });
    fireEvent.change(inputs[3], { target: { value: "۸۰" } });
    const serialized = container.querySelector(
      'input[name="subdivisionUnitsJson"]',
    ) as HTMLInputElement;
    expect(serialized.value).toContain('"identifier":"قطعه 12"');
    expect(serialized.value).toContain('"area":"80"');
  });
});
