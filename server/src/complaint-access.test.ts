import { describe, expect, it } from "vitest";
import { canAccessComplaint, canUpdateComplaint } from "./complaint-access.js";

const base = { applicantId: 10, assignedTo: null, status: "received" };

describe("complaint authorization boundaries", () => {
  it("keeps applicants owner-scoped", () => {
    expect(canAccessComplaint({ id: 10, role: "applicant" }, base)).toBe(true);
    expect(canAccessComplaint({ id: 11, role: "applicant" }, base)).toBe(false);
    expect(canAccessComplaint({ id: 10, role: "representative" }, base)).toBe(
      true,
    );
  });

  it("limits support to its queue or its own assignment", () => {
    expect(canAccessComplaint({ id: 20, role: "support" }, base)).toBe(true);
    expect(
      canAccessComplaint(
        { id: 20, role: "support" },
        { ...base, assignedTo: 21 },
      ),
    ).toBe(false);
    expect(
      canAccessComplaint(
        { id: 20, role: "support" },
        { ...base, assignedTo: 20, status: "closed" },
      ),
    ).toBe(true);
    expect(
      canAccessComplaint(
        { id: 20, role: "support" },
        { ...base, status: "closed" },
      ),
    ).toBe(false);
  });

  it("allows only supervisors to update another support queue", () => {
    expect(canUpdateComplaint({ id: 20, role: "support" }, base)).toBe(true);
    expect(
      canUpdateComplaint(
        { id: 20, role: "support" },
        { ...base, assignedTo: 21 },
      ),
    ).toBe(false);
    expect(
      canUpdateComplaint(
        { id: 30, role: "operations_manager" },
        { ...base, assignedTo: 21 },
      ),
    ).toBe(true);
    expect(
      canUpdateComplaint(
        { id: 20, role: "support" },
        { ...base, assignedTo: 20, status: "closed" },
      ),
    ).toBe(false);
  });
});
