import type { NextFunction, Response } from "express";
import { describe, expect, it } from "vitest";
import { enforceReadOnlyRole } from "./security.js";
import type { AuthRequest, RoleCode } from "./types.js";

function invoke(role: RoleCode, method: string) {
  const req = { user: { id: 1, role, name: "test" }, method } as AuthRequest;
  let status = 200;
  let body: unknown;
  let continued = false;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  const next = (() => {
    continued = true;
  }) as NextFunction;

  enforceReadOnlyRole("observer")(req, res, next);
  return { status, body, continued };
}

describe("read-only registry observer", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("allows safe %s requests", (method) => {
    expect(invoke("observer", method)).toEqual({
      status: 200,
      body: undefined,
      continued: true,
    });
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])(
    "rejects %s mutations before route logic",
    (method) => {
      const result = invoke("observer", method);
      expect(result.status).toBe(403);
      expect(result.continued).toBe(false);
      expect(result.body).toEqual({
        message: "نقش ناظر فقط مجاز به مشاهده اطلاعات است.",
      });
    },
  );

  it("does not restrict authorized operational roles", () => {
    expect(invoke("operations_manager", "POST").continued).toBe(true);
  });
});
