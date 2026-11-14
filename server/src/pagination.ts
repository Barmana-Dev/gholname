import type { Request } from "express";

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/** Parse bounded page parameters without ever interpolating user input into SQL. */
export function pagination(
  req: Pick<Request, "query">,
  defaults: { limit?: number; maxLimit?: number } = {},
): Pagination {
  const defaultLimit = Math.min(
    Math.max(1, Math.trunc(defaults.limit ?? 50)),
    Math.max(1, Math.trunc(defaults.maxLimit ?? 100)),
  );
  const maxLimit = Math.max(defaultLimit, Math.trunc(defaults.maxLimit ?? 100));
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? defaultLimit);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isSafeInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;
  const offset = (page - 1) * limit;
  return {
    page,
    limit,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  };
}

export function paginationHeaders(
  response: { setHeader(name: string, value: string | number): unknown },
  value: Pagination,
): void {
  response.setHeader("X-Page", value.page);
  response.setHeader("X-Page-Size", value.limit);
}
