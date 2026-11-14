// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersianDateField } from "./PersianDateField";

describe("PersianDateField", () => {
  it("keeps a Persian display while submitting an ISO value", () => {
    const { container } = render(
      <PersianDateField name="effectiveAt" label="تاریخ اجرا" required />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "۱۴۰۳/۰۱/۰۱" },
    });
    expect(
      (container.querySelector('input[name="effectiveAt"]') as HTMLInputElement)
        .value,
    ).toBe("2024-03-20");
  });
});
