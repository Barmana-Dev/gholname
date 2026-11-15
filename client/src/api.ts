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
