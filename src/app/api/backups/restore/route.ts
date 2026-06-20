import { NextResponse } from "next/server";
import { restoreBackup } from "@/lib/services/backup";
import { parseBody, isErrorResponse, handleServiceError } from "@/lib/api/helpers";
import { RestoreBackupSchema } from "@/lib/validators/backups";
import { apiLogger } from "@/lib/logger";

const DB_PATH = process.env.DATABASE_URL ?? "./data/kinti.db";

export async function POST(req: Request): Promise<NextResponse> {
  const input = await parseBody(req, RestoreBackupSchema);
  if (isErrorResponse(input)) return input;

  try {
    const result = await restoreBackup(DB_PATH, input.filename);
    apiLogger.info(result, "Database restored from backup");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    if (message.includes("not found") || message.includes("Invalid backup")) {
      return NextResponse.json({ error: message, code: "NOT_FOUND" }, { status: 404 });
    }
    return handleServiceError(err);
  }
}
