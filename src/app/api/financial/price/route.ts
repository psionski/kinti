import { NextResponse } from "next/server";
import { getFinancialDataService } from "@/lib/api/services";
import { parseSearchParams, isErrorResponse } from "@/lib/api/helpers";
import { GetPriceSchema } from "@/lib/validators/financial";
import { getBaseCurrency } from "@/lib/format";

export async function GET(req: Request): Promise<NextResponse> {
  const input = parseSearchParams(req.url, GetPriceSchema);
  if (isErrorResponse(input)) return input;

  // Default to the configured base currency when no target is supplied. Done
  // here rather than in the schema because Zod can't default to a runtime value.
  const targetCurrency = input.currency ?? getBaseCurrency();

  const result = await getFinancialDataService().getPrice(
    input.symbolMap,
    targetCurrency,
    input.date
  );
  if (!result) return NextResponse.json({ error: "No price available" }, { status: 404 });
  return NextResponse.json(result);
}
