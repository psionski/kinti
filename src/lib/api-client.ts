import { ErrorResponseSchema, type ErrorCode } from "@/lib/validators/common";
import { toSearchParams, type SearchParamsInput } from "@/lib/api/search-params";

/**
 * A request the API answered with an error status. Carries the error contract
 * (`error`/`code`/`details`) when the body has one, so callers can show the
 * server's message instead of a generic failure.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCode | null = null,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  // The response is typed by the endpoint's contract; the API validates what
  // it sends, so the client does not re-validate it here.
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = ErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(parsed.data.error, res.status, parsed.data.code, parsed.data.details);
  }
  return new ApiError(`Request failed (${res.status})`, res.status);
}

/** GET a JSON endpoint, encoding `params` the way the API's query parser decodes them. */
export function apiGet<T>(
  path: string,
  params: SearchParamsInput = {},
  init: { signal?: AbortSignal } = {}
): Promise<T> {
  const query = toSearchParams(params).toString();
  return request<T>(query ? `${path}?${query}` : path, { signal: init.signal });
}

/** Send a JSON body (or none) to a mutating endpoint. */
export function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  return request<T>(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Send a multipart form (file uploads) to a mutating endpoint. */
export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body: form });
}
