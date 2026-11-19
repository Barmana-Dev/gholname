const API = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: unknown,
  ) {
    super(message);
  }
}

const CSRF_COOKIE = "regbroker_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The session itself lives in an HttpOnly cookie that JavaScript cannot read.
 * Only the double-submit CSRF token is readable; it is echoed in a header on
 * state-changing requests.
 */
function csrfToken(): string | null {
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

function csrfHeaders(method: string | undefined): Record<string, string> {
  if (SAFE_METHODS.has((method ?? "GET").toUpperCase())) return {};
  const token = csrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...csrfHeaders(options.method),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.message ?? "ارتباط با سامانه ناموفق بود.",
      response.status,
      data.errors,
    );
  return data as T;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

/**
 * Fetches one page of a list endpoint. The API reports the page size it
 * actually applied in `X-Page-Size`; a full page means there may be more.
 * Endpoints that do not paginate (no header) are returned whole.
 */
export async function requestPage<T>(
  path: string,
  page = 1,
  limit = 100,
): Promise<PagedResult<T>> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `${API}${path}${separator}page=${page}&limit=${limit}`,
    { credentials: "same-origin" },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.message ?? "ارتباط با سامانه ناموفق بود.",
      response.status,
      data.errors,
    );
  const items = Array.isArray(data) ? (data as T[]) : [];
  const appliedLimit = Number(response.headers.get("X-Page-Size"));
  return {
    items,
    page,
    hasMore: appliedLimit > 0 && items.length >= appliedLimit,
  };
}

export interface AllResult<T> {
  items: T[];
  /** True when the safety cap was reached while the server still had more. */
  truncated: boolean;
  /** The first page that was not loaded; pass as startPage to continue. */
  nextPage: number;
}

/**
 * Loads every page of a list up to a safety cap. The result says explicitly
 * whether it is complete, so callers never present a truncated list (or the
 * statistics derived from it) as the whole set. Continue with startPage.
 */
export async function requestAll<T>(
  path: string,
  options: { startPage?: number; maxPages?: number } = {},
): Promise<AllResult<T>> {
  const startPage = Math.max(1, Math.trunc(options.startPage ?? 1));
  const maxPages = Math.max(1, Math.trunc(options.maxPages ?? 40));
  const all: T[] = [];
  let page = startPage;
  for (let loaded = 0; loaded < maxPages; loaded += 1, page += 1) {
    const result = await requestPage<T>(path, page, 250);
    all.push(...result.items);
    if (!result.hasMore) return { items: all, truncated: false, nextPage: page + 1 };
  }
  return { items: all, truncated: true, nextPage: page };
}

export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  const response = await fetch(`${API}${path}`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.message ?? "دریافت فایل ناموفق بود.",
      response.status,
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};
export const formatMoney = (value: number) =>
  `${new Intl.NumberFormat("fa-IR").format(value)} ریال`;
