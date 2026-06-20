import { z } from "zod";
import { BackupInfoSchema, RestoreBackupSchema } from "@/lib/validators/backups";
import { SetBaseCurrencySchema } from "@/lib/validators/settings";
import { op } from "./helpers";

const BackupInfo = BackupInfoSchema.meta({ id: "BackupInfo" });

export const settingsPaths = {
  "/api/settings/timezone": {
    get: op({
      id: "getTimezone",
      summary: "Get the configured timezone",
      tags: ["Settings"],
      response: z.object({ timezone: z.string().nullable() }),
      errors: [500],
    }),
    put: op({
      id: "setTimezone",
      summary: "Set the app timezone",
      tags: ["Settings"],
      body: z.object({ timezone: z.string() }),
      response: z.object({ timezone: z.string() }),
      errors: [400, 500],
    }),
  },
  "/api/settings/base-currency": {
    get: op({
      id: "getBaseCurrency",
      summary: "Get the configured base currency",
      tags: ["Settings"],
      response: z.object({
        currency: z
          .string()
          .nullable()
          .describe("ISO 4217 base currency, or null if not yet configured"),
      }),
      errors: [500],
    }),
    put: op({
      id: "setBaseCurrency",
      summary: "Set the base currency (immutable after first set)",
      tags: ["Settings"],
      body: SetBaseCurrencySchema,
      response: z.object({ currency: z.string() }),
      errors: [400, 409, 500],
    }),
  },
  "/api/backups": {
    get: op({
      id: "listBackups",
      summary: "List all available database backups",
      tags: ["Backups"],
      response: z.array(BackupInfo),
      errors: [500],
    }),
    post: op({
      id: "createBackup",
      summary: "Create a manual database backup",
      tags: ["Backups"],
      response: z.object({
        filename: z.string(),
        rotatedCount: z.number().int(),
      }),
      status: 201,
      errors: [500],
    }),
  },
  "/api/backups/restore": {
    post: op({
      id: "restoreBackup",
      summary: "Restore the database from a backup file",
      tags: ["Backups"],
      body: RestoreBackupSchema,
      response: z.object({
        restoredFrom: z.string(),
        safetyBackup: z.string(),
      }),
      errors: [400, 404, 500],
    }),
  },
};
