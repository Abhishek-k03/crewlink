// The only place the app talks to the network — everything above this deals in
// entities and errors, not fetch and status codes.

/**
 * Relative in the browser, so the service worker can intercept it. Tests use an
 * absolute URL since Node's `fetch` can't resolve a relative one.
 */
export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
};

/** Bearer token for `http` mode; stays null in `msw` mode, which has no notion of identity. */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export interface RuleViolationDetail {
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string[] | undefined>;
  readonly violations?: RuleViolationDetail[];

  constructor(
    status: number,
    message: string,
    options: {
      fieldErrors?: Record<string, string[] | undefined>;
      violations?: RuleViolationDetail[];
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = options.fieldErrors;
    this.violations = options.violations;
  }

  /** 422 means the input was well-formed but a business rule refused it. */
  get isRuleViolation(): boolean {
    return this.status === 422;
  }
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Drops empty values so absent filters do not become `?status=` in the URL. */
export function toQueryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      message?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      violations?: RuleViolationDetail[];
    };
    return new ApiError(response.status, body.message ?? response.statusText, {
      fieldErrors: body.fieldErrors,
      violations: body.violations,
    });
  } catch {
    return new ApiError(response.status, response.statusText || 'Request failed');
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const response = await fetch(`${apiConfig.baseUrl}${path}`, { ...init, headers });

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
