import { NextResponse } from "next/server";
import { getRecurringService } from "@/lib/api/services";
import { parseBody, isErrorResponse, handleServiceError } from "@/lib/api/helpers";
import { CreateRecurringSchema } from "@/lib/validators/recurring";

export async function POST(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, CreateRecurringSchema);
  if (isErrorResponse(input)) return input;

  try {
    const recurring = await getRecurringService().create(input);
    return NextResponse.json(recurring, { status: 201 });
  } catch (err) {
    return handleServiceError(err, "Category not found");
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const result = getRecurringService().list();
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
