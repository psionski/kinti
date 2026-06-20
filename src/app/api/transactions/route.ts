import { NextResponse } from "next/server";
import { getTransactionService } from "@/lib/api/services";
import {
  parseBody,
  parseSearchParams,
  isErrorResponse,
  handleServiceError,
} from "@/lib/api/helpers";
import {
  CreateTransactionSchema,
  UpdateTransactionsBatchSchema,
  ListTransactionsSchema,
  DeleteTransactionsBatchSchema,
} from "@/lib/validators/transactions";

export async function POST(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, CreateTransactionSchema);
  if (isErrorResponse(input)) return input;

  try {
    const tx = await getTransactionService().create(input);
    return NextResponse.json(tx, { status: 201 });
  } catch (err) {
    return handleServiceError(err, "Referenced category or receipt not found");
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, UpdateTransactionsBatchSchema);
  if (isErrorResponse(input)) return input;

  try {
    const results = await getTransactionService().updateBatch(input);
    return NextResponse.json(results);
  } catch (err) {
    return handleServiceError(err, "Referenced category not found");
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, DeleteTransactionsBatchSchema);
  if (isErrorResponse(input)) return input;

  try {
    const deleted = getTransactionService().deleteBatch(input.ids);
    return NextResponse.json({ deleted });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const input = parseSearchParams(req.url, ListTransactionsSchema);
  if (isErrorResponse(input)) return input;

  try {
    const result = getTransactionService().list(input);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
