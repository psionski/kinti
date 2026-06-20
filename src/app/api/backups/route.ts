import { NextResponse } from "next/server";
import { runBackup, listBackups } from "@/lib/services/backup";
import { handleServiceError } from "@/lib/api/helpers";
import { apiLogger } from "@/lib/logger";

const DB_PATH = process.env.DATABASE_URL ?? "./data/kinti.db";

export function GET(): NextResponse {
  try {
    const backups = listBackups();
    return NextResponse.json(backups);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function POST(): Promise<NextResponse> {
  try {
    const result = await runBackup(DB_PATH);
    apiLogger.info({ path: result.path, rotated: result.rotatedCount }, "Manual backup created");
    return NextResponse.json(
      { filename: result.path.split(/[\\/]/).pop(), rotatedCount: result.rotatedCount },
      { status: 201 }
    );
  } catch (err) {
    return handleServiceError(err);
  }
}
