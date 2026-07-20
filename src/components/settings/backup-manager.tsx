"use client";

import { useState } from "react";
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
import type { BackupInfo } from "@/lib/services/backup";
import { Section } from "./settings-section";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

interface BackupManagerProps {
  initialBackups: BackupInfo[];
  isOnboarding?: boolean;
  onContinue?: () => void;
}

export function BackupManager({
  initialBackups,
  isOnboarding,
  onContinue,
}: BackupManagerProps): React.ReactElement {
  const [backups, setBackups] = useState<BackupInfo[]>(initialBackups);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshBackups(): Promise<void> {
    const res = await fetch("/api/backups");
    if (res.ok) {
      setBackups((await res.json()) as BackupInfo[]);
    }
  }

  async function handleCreate(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Backup failed");
      }
      await refreshBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(): Promise<void> {
    if (!restoreTarget) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: restoreTarget }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Restore failed");
      }
      setRestoreTarget(null);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      setRestoring(false);
    }
  }

  return (
    <Section
      title="Database Backups"
      description="Backups are created automatically every day. You can also create one manually or restore from a previous backup."
      icon={<HardDrive className="text-muted-foreground size-5" />}
    >
      <div className="flex">
        <Button variant="outline" size="sm" onClick={() => void handleCreate()} disabled={creating}>
          <Plus className="mr-1.5 size-3.5" />
          {creating ? "Creating..." : "Create Backup"}
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {backups.length === 0 ? (
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

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Database</DialogTitle>
            <DialogDescription>
              This will replace the current database with the backup{" "}
              <span className="font-medium">{restoreTarget}</span>. A safety backup of the current
              database will be created automatically before restoring.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleRestore()} disabled={restoring}>
              <Download className="mr-1.5 size-4" />
              {restoring ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
