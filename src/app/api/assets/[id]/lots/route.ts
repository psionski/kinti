import { NextResponse } from "next/server";
import { getAssetLotService } from "@/lib/api/services";
import { parseId, parseBody, isErrorResponse, handleServiceError } from "@/lib/api/helpers";
import { CreateOpeningLotSchema } from "@/lib/validators/assets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const id = parseId(await ctx.params);
  if (isErrorResponse(id)) return id;

  const lots = getAssetLotService().listLots(id);
  return NextResponse.json(lots);
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const id = parseId(await ctx.params);
  if (isErrorResponse(id)) return id;

  const input = await parseBody(req, CreateOpeningLotSchema);
  if (isErrorResponse(input)) return input;

  try {
    const lot = await getAssetLotService().createOpeningLot(id, input);
    return NextResponse.json(lot, { status: 201 });
  } catch (err) {
    return handleServiceError(err, `Asset ${id} not found`);
  }
}
