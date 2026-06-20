import { NextResponse } from "next/server";
import { getAssetLotService } from "@/lib/api/services";
import {
  parseBody,
  parseId,
  isErrorResponse,
  errorResponse,
  handleServiceError,
} from "@/lib/api/helpers";
import { BuyAssetSchema } from "@/lib/validators/assets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const id = parseId(await ctx.params);
  if (isErrorResponse(id)) return id;

  const input = await parseBody(req, BuyAssetSchema);
  if (isErrorResponse(input)) return input;

  try {
    const result = await getAssetLotService().buy(id, input);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg.includes("not found")) return errorResponse(msg, "NOT_FOUND", 404);
    return handleServiceError(err);
  }
}
