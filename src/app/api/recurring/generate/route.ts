import { NextResponse } from "next/server";
import { getRecurringService } from "@/lib/api/services";
import { errorResponse } from "@/lib/api/helpers";

export async function POST(): Promise<NextResponse> {
  try {
    const created = await getRecurringService().generatePending();
    return NextResponse.json({ created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return errorResponse(message, "INTERNAL_ERROR", 500);
  }
}
