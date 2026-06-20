import { NextResponse } from "next/server";
import { getSettingsService } from "@/lib/api/services";
import { parseBody, isErrorResponse, handleServiceError } from "@/lib/api/helpers";
import { SetBaseCurrencySchema } from "@/lib/validators/settings";

export function GET(): NextResponse {
  const currency = getSettingsService().getBaseCurrency();
  return NextResponse.json({ currency });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, SetBaseCurrencySchema);
  if (isErrorResponse(input)) return input;

  try {
    getSettingsService().setBaseCurrency(input.currency);
    return NextResponse.json({ currency: input.currency });
  } catch (err) {
    return handleServiceError(err);
  }
}
