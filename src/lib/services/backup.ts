import { Temporal } from "@js-temporal/polyfill";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { basename, join } from "path";
import { utcToLocal } from "@/lib/date-ranges";
import { resetDb } from "@/lib/db";

export interface BackupResult {
  path: string;
  rotatedCount: number;
}

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  /** Timestamp in the user's local timezone, e.g. "2026-03-22T18:07:49" */
  createdAt: string;
}

export interface BackupOptions {
  /** Directory where backup files are written. Defaults to `./data/backups`. */
  backupDir?: string;
  /** Maximum number of backup files to keep. Oldest are removed first. Defaults to 7. */
  keep?: number;
}

const BACKUP_PREFIX = "kinti-backup-";
const BACKUP_SUFFIX = ".db";

/** Regex matching the `YYYY-MM-DDTHH-MM-SSZ` timestamp embedded before `.db`. */
const TIMESTAMP_RE = /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})Z\.db$/;

function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX);
}

function defaultBackupDir(): string {
  return join(process.cwd(), "data", "backups");
}

/**
 * Generate a UTC timestamp string for backup filenames.
 * Format: `YYYY-MM-DDTHH-MM-SSZ` (colons replaced with dashes for filesystem safety,
 * Z suffix retained to mark it as UTC).
 */
function backupTimestamp(): string {
  return Temporal.Now.instant()
    .toString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "Z");
}

/**
 * Extract a UTC ISO timestamp from a backup filename.
 * Matches the `YYYY-MM-DDTHH-MM-SSZ` portion at the end (before `.db`)
 * and converts it back to `YYYY-MM-DDTHH:MM:SSZ`.
 * Returns null for filenames that don't contain a parseable timestamp.
 */
export function parseFilenameTimestamp(filename: string): string | null {
  const match = filename.match(TIMESTAMP_RE);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3]}Z`;
}

/**
 * Back up the SQLite database at `dbPath` to `backupDir`, then rotate old backups
 * so that at most `keep` files are retained.
 *
 * File naming: `kinti-backup-YYYY-MM-DDTHH-MM-SSZ.db`
 */
export async function runBackup(
  dbPath: string,
  options: BackupOptions = {}
): Promise<BackupResult> {
  const backupDir = options.backupDir ?? defaultBackupDir();
  const keep = options.keep ?? 7;

  mkdirSync(backupDir, { recursive: true });

  const fileName = `${BACKUP_PREFIX}${backupTimestamp()}${BACKUP_SUFFIX}`;
  const destPath = join(backupDir, fileName);

  // better-sqlite3's .backup() is async — returns a Promise
  const source = new Database(dbPath, { readonly: true });
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }

  // Rotate: list backups sorted oldest-first, remove excess
  const rotatedCount = rotateBackups(backupDir, keep);

  return { path: destPath, rotatedCount };
}

/**
 * List all backup files in `backupDir`, sorted newest-first.
 * Only includes files whose filename contains a parseable UTC timestamp.
 * Timestamps are converted to the user's local timezone.
 */
export function listBackups(backupDir?: string): BackupInfo[] {
  const dir = backupDir ?? defaultBackupDir();

  if (!existsSync(dir)) return [];

  const results: BackupInfo[] = [];

  for (const name of readdirSync(dir)) {
    if (!isBackupFile(name)) continue;
    const utcIso = parseFilenameTimestamp(name);
    if (!utcIso) continue; // skip files without a parseable timestamp

    const stat = statSync(join(dir, name));
    results.push({
      filename: name,
      sizeBytes: stat.size,
      createdAt: utcToLocal(utcIso),
    });
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Restore a backup using the SQLite backup API. The live DB connection is
 * closed first, then the backup file is copied into the live DB path via
 * `better-sqlite3`'s `.backup()`. Any stale WAL/SHM files are removed to
 * prevent mispairing corruption. The next `getDb()` call reinitializes
 * from the restored file.
 *
 * Before restoring, a safety backup of the current DB is created.
 */
export async function restoreBackup(
  dbPath: string,
  filename: string,
  backupDir?: string
): Promise<{ restoredFrom: string; safetyBackup: string }> {
  const dir = backupDir ?? defaultBackupDir();
  const sanitized = basename(filename);

  if (!isBackupFile(sanitized)) {
    throw new Error(`Invalid backup filename: ${sanitized}`);
  }

  const backupPath = join(dir, sanitized);
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${sanitized}`);
  }

  // Validate the backup is a readable SQLite database
  const test = new Database(backupPath, { readonly: true });
  try {
    test.pragma("integrity_check");
  } finally {
    test.close();
  }

  // Create a safety backup of the current DB before overwriting
  const safetyName = `${BACKUP_PREFIX}pre-restore-${backupTimestamp()}${BACKUP_SUFFIX}`;
  const safetyPath = join(dir, safetyName);
  mkdirSync(dir, { recursive: true });

  const current = new Database(dbPath, { readonly: true });
  try {
    await current.backup(safetyPath);
  } finally {
    current.close();
  }

  // Close the live connection before overwriting
  resetDb();

  // Remove stale WAL/SHM files to prevent corruption from mispairing
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (existsSync(p)) rmSync(p);
  }

  // Use the SQLite backup API (not raw file copy) for a consistent restore
  const source = new Database(backupPath, { readonly: true });
  try {
    await source.backup(dbPath);
  } finally {
    source.close();
  }

  return { restoredFrom: sanitized, safetyBackup: safetyName };
}

/** Remove excess backup files, keeping the newest `keep` files. Returns the count removed. */
function rotateBackups(backupDir: string, keep: number): number {
  const files = readdirSync(backupDir)
    .filter(isBackupFile)
    .map((f) => ({ name: f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  const excess = files.length - keep;
  let rotatedCount = 0;
  if (excess > 0) {
    for (const file of files.slice(0, excess)) {
      rmSync(join(backupDir, file.name));
      rotatedCount++;
    }
  }
  return rotatedCount;
}
