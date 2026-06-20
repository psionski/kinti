import { NextResponse } from "next/server";
import { getFinancialDataService } from "@/lib/api/services";
import { parseSearchParams, isErrorResponse, errorResponse } from "@/lib/api/helpers";
import { ConvertCurrencySchema } from "@/lib/validators/financial";

export async function GET(req: Request): Promise<NextResponse> {
  const input = parseSearchParams(req.url, ConvertCurrencySchema);
  if (isErrorResponse(input)) return input;

  const result = await getFinancialDataService().convert(
    input.amount,
    input.from,
    input.to,
    undefined,
    input.date
  );
  if (!result) {
    return errorResponse(
      `No exchange rate available for ${input.from}→${input.to}`,
      "NOT_FOUND",
      404
    );
  }

  return NextResponse.json(result);
}
