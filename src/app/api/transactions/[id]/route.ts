import { NextResponse } from "next/server";
import { getTransactionService } from "@/lib/api/services";
import { parseBody, isErrorResponse, errorResponse, parseId } from "@/lib/api/helpers";
import { UpdateTransactionSchema } from "@/lib/validators/transactions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const id = parseId(await ctx.params);
  if (isErrorResponse(id)) return id;

  const tx = getTransactionService().getById(id);
  if (!tx) return errorResponse("Transaction not found", "NOT_FOUND", 404);
  return NextResponse.json(tx);
}

export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const id = parseId(await ctx.params);
  if (isErrorResponse(id)) return id;

  const input = await parseBody(req, UpdateTransactionSchema);
  if (isErrorResponse(input)) return input;

  try {
    const tx = await getTransactionService().update(id, input);
    if (!tx) return errorResponse("Transaction not found", "NOT_FOUND", 404);
    return NextResponse.json(tx);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to update transaction",
      "INTERNAL_ERROR",
      500
    );
  }
}

export async function DELETE(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const id = parseId(await ctx.params);
  if (isErrorResponse(id)) return id;

  const deleted = getTransactionService().delete(id);
  if (!deleted) return errorResponse("Transaction not found", "NOT_FOUND", 404);
  return NextResponse.json({ success: true });
}
