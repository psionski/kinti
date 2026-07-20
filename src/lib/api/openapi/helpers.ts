import { z, type ZodType } from "zod";
import type {
  ZodOpenApiOperationObject,
  ZodOpenApiResponsesObject,
  ZodOpenApiParameters,
} from "zod-openapi";
import { ErrorResponseSchema } from "@/lib/validators/common";
import { TransactionResponseSchema } from "@/lib/validators/transactions";

// ─── Shared schemas (used by multiple domain fragments) ─────────────────────

export const ErrorSchema = ErrorResponseSchema.meta({ id: "ErrorResponse" });
export const SuccessSchema = z.object({ success: z.boolean() }).meta({ id: "SuccessResponse" });
export const Transaction = TransactionResponseSchema.meta({ id: "Transaction" });

// ─── Operation builder ──────────────────────────────────────────────────────

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Validation error",
  404: "Not found",
  409: "Conflict",
  500: "Internal server error",
};

export interface OpConfig {
  id: string;
  summary: string;
  tags: string[];
  query?: ZodType;
  body?: ZodType;
  pathId?: string;
  response: ZodType;
  status?: number;
  errors: number[];
}

export function op(cfg: OpConfig): ZodOpenApiOperationObject {
  // Build responses — use Object.fromEntries to satisfy the template literal index type
  const entries: Array<
    [string, { description: string; content?: Record<string, { schema: ZodType }> }]
  > = [];

  entries.push([
    String(cfg.status ?? 200),
    {
      description: cfg.summary,
      content: { "application/json": { schema: cfg.response } },
    },
  ]);
  for (const code of cfg.errors) {
    entries.push([
      String(code),
      {
        description: ERROR_DESCRIPTIONS[code] ?? "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    ]);
  }

  const result: ZodOpenApiOperationObject = {
    operationId: cfg.id,
    summary: cfg.summary,
    tags: cfg.tags,
    responses: Object.fromEntries(entries) as ZodOpenApiResponsesObject,
  };

  if (cfg.pathId) {
    result.requestParams = {
      path: z.object({ id: z.string().meta({ description: cfg.pathId }) }),
    };
  }
  if (cfg.query) {
    result.requestParams = {
      ...result.requestParams,
      query: cfg.query as ZodOpenApiParameters["query"],
    };
  }
  if (cfg.body) {
    result.requestBody = {
      required: true,
      content: { "application/json": { schema: cfg.body } },
    };
  }

  return result;
}
