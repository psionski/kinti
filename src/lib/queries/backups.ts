import { queryOptions, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import type { BackupInfoResponse, RestoreBackupSchema } from "@/lib/validators/backups";

export const backupKeys = {
  all: ["backups"] as const,
  list: () => [...backupKeys.all, "list"] as const,
};

/** Every backup on disk, newest first — `GET /api/backups`. */
export function backupListQuery() {
  return queryOptions({
    queryKey: backupKeys.list(),
    queryFn: ({ signal }) => apiGet<BackupInfoResponse[]>("/api/backups", {}, { signal }),
  });
}

export function useCreateBackup() {
  return useMutation({
    mutationFn: () => apiSend<{ filename: string; rotatedCount: number }>("POST", "/api/backups"),
  });
}

/**
 * Replace the database with a backup, then reload the page: everything on
 * screen — the server-rendered layout included — came from the replaced
 * database. The reload belongs to the mutation rather than to one `mutate`
 * call so that closing the confirmation mid-restore cannot skip it.
 */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: (body: z.input<typeof RestoreBackupSchema>) =>
      apiSend<{ restoredFrom: string; safetyBackup: string }>("POST", "/api/backups/restore", body),
    onSuccess: () => window.location.reload(),
  });
}
