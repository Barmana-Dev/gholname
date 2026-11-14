import { describe, expect, it } from "vitest";
import { extraStaticPages } from "./PublicEnhancements";
import { managedStatusOptions, reviewStatusOptions } from "./page-02-policy";

describe("page 2 RTL legal scope presentation", () => {
  it("states the ban on guarantees, influence and unlawful acceleration", () => {
    const about = extraStaticPages["/about"];
    const text = [
      about.body,
      ...about.sections.flatMap((item) => [item.h, item.p]),
    ].join(" ");
    expect(text).toContain("تضمین");
    expect(text).toContain("نفوذ");
    expect(text).toContain("خارج از ضابطه");
    expect(text).toContain("محرمانگی");
  });

  it("does not expose registry or final actions in the expert option set", () => {
    const expertValues = reviewStatusOptions.map(([value]) => value);
    const managerValues = managedStatusOptions.map(([value]) => value);
    expect(expertValues).not.toContain("registry_exchange");
    expect(expertValues).not.toContain("completed");
    expect(managerValues).toContain("registry_exchange");
    expect(managerValues).toContain("completed");
  });
});
