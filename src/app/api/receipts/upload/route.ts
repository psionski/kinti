import { NextResponse } from "next/server";
import { extname } from "path";
import { errorResponse } from "@/lib/api/helpers";
import { CreateReceiptSchema } from "@/lib/validators/receipts";
import { getReceiptService } from "@/lib/api/services";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".pdf"]);

export async function POST(req: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Invalid multipart/form-data body", "VALIDATION_ERROR", 400);
  }

  const imageFile = formData.get("image");
  if (!imageFile || !(imageFile instanceof File)) {
    return errorResponse("Missing required field: image (must be a file)", "VALIDATION_ERROR", 400);
  }

  const ext = extname(imageFile.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return errorResponse(
      `Unsupported file type: ${ext}. Allowed: jpg, jpeg, png, gif, webp, heic, pdf`,
      "VALIDATION_ERROR",
      400
    );
  }

  // Parse optional metadata fields
  const rawMeta: Record<string, unknown> = {};
  const merchant = formData.get("merchant");
  const date = formData.get("date");
  const total = formData.get("total");
  const rawText = formData.get("raw_text");
  if (merchant && typeof merchant === "string") rawMeta.merchant = merchant;
  if (date && typeof date === "string") rawMeta.date = date;
  if (total && typeof total === "string") rawMeta.total = Number(total);
  if (rawText && typeof rawText === "string") rawMeta.rawText = rawText;

  const metaResult = CreateReceiptSchema.safeParse(rawMeta);
  if (!metaResult.success) {
    return errorResponse("Validation failed", "VALIDATION_ERROR", 400, {
      issues: metaResult.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  const buffer = Buffer.from(await imageFile.arrayBuffer());
  const receipt = getReceiptService().upload(buffer, ext, metaResult.data);

  return NextResponse.json({ receipt_id: receipt.id }, { status: 201 });
}
