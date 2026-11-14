import { describe, expect, it } from "vitest";
import { RATE_LIMIT_MESSAGE, createRateLimiter } from "./rate-limit.js";

function mockResponse() {
  const headers: Record<string, string> = {};
  let body: unknown;
  const response = {
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    setHeader(name: string, value: string | number) {
      headers[name.toLowerCase()] = String(value);
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      response.writableEnded = true;
      return response;
    },
  };
  return { response, headers, getBody: () => body };
}

describe("request rate limiting", () => {
  it("returns a structured Persian 429 response after the budget is exhausted", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, limit: 1 });
    const request = {
      app: { get: (name: string) => (name === "trust proxy" ? false : undefined) },
      headers: { "x-forwarded-for": "203.0.113.7" },
      ip: "198.51.100.77",
    } as never;
    let nextCalls = 0;
    const first = mockResponse();
    await limiter(request, first.response as never, () => {
      nextCalls += 1;
    });
    const second = mockResponse();
    await limiter(request, second.response as never, () => {
      nextCalls += 1;
    });

    expect(nextCalls).toBe(1);
    expect(second.response.statusCode).toBe(429);
    expect(second.getBody()).toEqual({
      message: RATE_LIMIT_MESSAGE,
      retryAfterSeconds: 60,
    });
    expect(second.headers["ratelimit-limit"]).toBe("1");
    expect(second.headers["ratelimit-remaining"]).toBe("0");
  });
});
