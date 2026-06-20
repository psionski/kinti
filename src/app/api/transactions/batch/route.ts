import { NextResponse } from "next/server";
import { getTransactionService } from "@/lib/api/services";
import { parseBody, isErrorResponse, handleServiceError } from "@/lib/api/helpers";
import { CreateTransactionsBatchSchema } from "@/lib/validators/transactions";

export async function POST(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, CreateTransactionsBatchSchema);
  if (isErrorResponse(input)) return input;

  try {
    const results = await getTransactionService().createBatch(input);
    return NextResponse.json(results, { status: 201 });
  } catch (err) {
    return handleServiceError(err, "Referenced category or receipt not found");
  }
}
