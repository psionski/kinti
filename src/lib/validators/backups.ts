import { z } from "zod";

export const RestoreBackupSchema = z.object({
  filename: z
    .string()
    .min(1)
    .regex(/^kinti-backup-.+\.db$/, "Invalid backup filename format")
    .describe("Backup filename from list_backups"),
});

export type RestoreBackupInput = z.infer<typeof RestoreBackupSchema>;

/** Shape returned by the API (timestamps already converted to local time). */
export const BackupInfoSchema = z.object({
  filename: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.string(),
});

export type BackupInfoResponse = z.infer<typeof BackupInfoSchema>;
