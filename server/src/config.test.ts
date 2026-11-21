import { afterEach, describe, expect, it, vi } from "vitest";

const originalPort = process.env.PORT;

async function loadPort(value: string | undefined) {
  if (value === undefined) delete process.env.PORT;
  else process.env.PORT = value;
  vi.resetModules();
  const module = await import("./config.js");
  return module.config.PORT;
}

describe("config PORT normalization", () => {
  afterEach(() => {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    vi.resetModules();
  });

  // Regression: test runners export PORT=0. config used to reject it with
  // `min(1)`, so every module importing config threw a ZodError during import
  // and 10 of 19 server test files never ran.
  it("falls back to the documented default for PORT=0", async () => {
    await expect(loadPort("0")).resolves.toBe(4000);
  });

  it("treats a blank PORT as unset", async () => {
    await expect(loadPort("  ")).resolves.toBe(4000);
  });

  it("keeps an explicit valid port", async () => {
    await expect(loadPort("4123")).resolves.toBe(4123);
  });

  it("still rejects an out-of-range port", async () => {
    await expect(loadPort("70000")).rejects.toThrow();
  });
});
