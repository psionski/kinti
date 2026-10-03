import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ErrorCode, ErrorResponse } from "@/lib/validators/common";
import { ValidationError } from "@/lib/errors";
import { apiLogger } from "@/lib/logger";
import { searchParamsToObject } from "./search-params";

/** Return a structured JSON error response. */
export function errorResponse(
  message: string,
  code: ErrorCode,
  status: number,
  details?: unknown
): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: message, code, details }, { status });
}

/** Parse and validate a JSON request body against a Zod schema. */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<T | NextResponse<ErrorResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }
  return parseWith(body, schema);
}

/** Decode query/search params by the types `schema` declares, then validate. */
export function parseSearchParams<T>(
  url: string,
  schema: ZodType<T>
): T | NextResponse<ErrorResponse> {
  const { searchParams } = new URL(url);
  return parseWith(searchParamsToObject(searchParams, schema), schema);
}

/** Validate data against a Zod schema and return the parsed result or an error response. */
function parseWith<T>(data: unknown, schema: ZodType<T>): T | NextResponse<ErrorResponse> {
  const result = schema.safeParse(data);
  if (!result.success) {
    return errorResponse(
      "Validation failed",
      "VALIDATION_ERROR",
      400,
      formatZodError(result.error)
    );
  }
  return result.data;
}

function formatZodError(error: ZodError): { issues: Array<{ path: string; message: string }> } {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/** Map common DB constraint errors to structured API responses. Use in catch blocks. */
export function handleServiceError(
  err: unknown,
  foreignKeyMessage = "Referenced entity not found"
): NextResponse<ErrorResponse> {
  const message = err instanceof Error ? err.message : "Internal error";
  // A rejected input is the caller's problem, not a server fault: 400, and a
  // warn rather than an error, so a deliberate guard firing doesn't read as an
  // outage in the logs.
  if (err instanceof ValidationError) {
    apiLogger.warn({ err }, "Rejected by a service guard");
    return errorResponse(message, "VALIDATION_ERROR", 400);
  }
  if (message.includes("FOREIGN KEY")) {
    apiLogger.warn({ err, context: foreignKeyMessage }, "Foreign key violation");
    return errorResponse(foreignKeyMessage, "NOT_FOUND", 404);
  }
  apiLogger.error({ err }, "Service error");
  return errorResponse(message, "INTERNAL_ERROR", 500);
}

/** Check if a value is a NextResponse (error). Type guard for parse helpers. */
export function isErrorResponse(value: unknown): value is NextResponse<ErrorResponse> {
  return value instanceof NextResponse;
}

/** Parse a route param as a positive integer ID. */
export function parseId(
  params: Record<string, string>,
  key = "id"
): number | NextResponse<ErrorResponse> {
  const raw = params[key];
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return errorResponse(`Invalid ${key}: must be a positive integer`, "VALIDATION_ERROR", 400);
  }
  return id;
}
