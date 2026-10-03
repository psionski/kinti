"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Download, Plus, RotateCcw, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { backupListQuery, useCreateBackup, useRestoreBackup } from "@/lib/queries/backups";
import { Section } from "./settings-section";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

interface BackupManagerProps {
  isOnboarding?: boolean;
  onContinue?: () => void;
}

export function BackupManager({
  isOnboarding,
  onContinue,
}: BackupManagerProps): React.ReactElement {
  const list = useQuery(backupListQuery());
  const backups = list.data ?? [];
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  function closeRestore(): void {
    setRestoreTarget(null);
    restoreBackup.reset();
  }

  function handleRestore(): void {
    if (!restoreTarget) return;
    restoreBackup.mutate({ filename: restoreTarget }, { onSuccess: () => setRestoreTarget(null) });
  }

  return (
    <Section
      title="Database Backups"
      description="Backups are created automatically every day. You can also create one manually or restore from a previous backup."
      icon={<HardDrive className="text-muted-foreground size-5" />}
    >
      <div className="flex">
        <Button
          variant="outline"
          size="sm"
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
        >
          <Plus className="mr-1.5 size-3.5" />
          {createBackup.isPending ? "Creating..." : "Create Backup"}
        </Button>
      </div>

      {createBackup.error && (
        <p className="text-destructive text-sm">{createBackup.error.message}</p>
      )}
      {list.isError && (
        <p className="text-destructive text-sm">Couldn&apos;t load backups: {list.error.message}</p>
      )}

      {list.isPending ? null : backups.length === 0 ? (
        <p className="text-muted-foreground text-sm">No backups available.</p>
      ) : (
        <div className="divide-border divide-y rounded-md border">
          {backups.map((b) => (
            <div key={b.filename} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <HardDrive className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{b.filename}</span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex gap-3 text-xs">
                  <span>{b.createdAt.replace("T", " ")}</span>
                  <span>{formatBytes(b.sizeBytes)}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRestoreTarget(b.filename)}>
                <RotateCcw className="mr-1.5 size-3.5" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}

      {isOnboarding && onContinue && (
        <div className="flex">
          <Button size="sm" onClick={onContinue}>
            Finish Setup
            <Check className="ml-1.5 size-4" />
          </Button>
        </div>
      )}

      <Dialog open={restoreTarget !== null} onOpenChange={(open) => !open && closeRestore()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Database</DialogTitle>
            <DialogDescription>
              This will replace the current database with the backup{" "}
              <span className="font-medium">{restoreTarget}</span>. A safety backup of the current
              database will be created automatically before restoring.
            </DialogDescription>
          </DialogHeader>
          {restoreBackup.error && (
            <p className="text-destructive text-sm">{restoreBackup.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeRestore} disabled={restoreBackup.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={restoreBackup.isPending}
            >
              <Download className="mr-1.5 size-4" />
              {restoreBackup.isPending ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
