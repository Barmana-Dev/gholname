import { describe, expect, it } from "vitest";
import { formatDate } from "./api";

describe("formatDate", () => {
  it("does not crash management panels on missing or invalid timestamps", () => {
    expect(formatDate()).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("requestPage / requestAll", () => {
  const original = globalThis.fetch;
  const respond = (items: unknown[], pageSize: number | null) =>
    new Response(JSON.stringify(items), {
      status: 200,
      headers: pageSize ? { "X-Page-Size": String(pageSize) } : {},
    });

  it("follows full pages until a short page", async () => {
    const pages = [[1, 2], [3, 4], [5]];
    let call = 0;
    globalThis.fetch = (async () => respond(pages[call++] ?? [], 2)) as typeof fetch;
    const { requestAll } = await import("./api");
    expect(await requestAll<number>("/x")).toEqual([1, 2, 3, 4, 5]);
    globalThis.fetch = original;
  });

  it("returns non-paginated endpoints whole instead of looping", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return respond([1, 2, 3], null);
    }) as typeof fetch;
    const { requestAll } = await import("./api");
    expect(await requestAll<number>("/x")).toEqual([1, 2, 3]);
    expect(calls).toBe(1);
    globalThis.fetch = original;
  });
});
