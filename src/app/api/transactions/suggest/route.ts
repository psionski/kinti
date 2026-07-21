import { NextResponse } from "next/server";
import { getTransactionService } from "@/lib/api/services";
import { errorResponse, isErrorResponse, parseSearchParams } from "@/lib/api/helpers";
import { SuggestSchema } from "@/lib/validators/transactions";

export async function GET(req: Request): Promise<NextResponse> {
  const input = parseSearchParams(req.url, SuggestSchema);
  if (isErrorResponse(input)) return input;

  try {
    const values = getTransactionService().suggest(input.field, input.q, input.limit);
    return NextResponse.json(values);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return errorResponse(message, "INTERNAL_ERROR", 500);
  }
}
