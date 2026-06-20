// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3";
import {
  runBackup,
  listBackups,
  restoreBackup,
  parseFilenameTimestamp,
} from "@/lib/services/backup";

describe("parseFilenameTimestamp", () => {
  it("extracts UTC ISO from a standard backup filename", () => {
    expect(parseFilenameTimestamp("kinti-backup-2026-03-22T16-07-49Z.db")).toBe(
      "2026-03-22T16:07:49Z"
    );
  });

  it("extracts UTC ISO from a pre-restore backup filename", () => {
    expect(parseFilenameTimestamp("kinti-backup-pre-restore-2026-03-22T16-07-49Z.db")).toBe(
      "2026-03-22T16:07:49Z"
    );
  });

  it("returns null for legacy filenames without Z suffix", () => {
    expect(parseFilenameTimestamp("kinti-backup-2026-03-22T16-07-49.db")).toBeNull();
  });

  it("returns null for epoch-based filenames", () => {
    expect(parseFilenameTimestamp("kinti-backup-pre-restore-1774193571481.db")).toBeNull();
  });
});

describe("runBackup", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `kinti-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    dbPath = join(tmpDir, "test.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO t VALUES (1)");
    db.close();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a backup file with Z-suffixed timestamp", async () => {
    const backupDir = join(tmpDir, "backups");
    const result = await runBackup(dbPath, { backupDir });

    expect(result.path).toContain("kinti-backup-");
    expect(result.rotatedCount).toBe(0);

    const files = readdirSync(backupDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^kinti-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.db$/);

    const backup = new Database(result.path, { readonly: true });
    const rows = backup.prepare("SELECT * FROM t").all();
    backup.close();
    expect(rows).toHaveLength(1);
  });

  it("rotates old backups when exceeding keep limit", async () => {
    const backupDir = join(tmpDir, "backups");
    mkdirSync(backupDir, { recursive: true });

    for (let i = 0; i < 3; i++) {
      const fName = `kinti-backup-2026-01-0${i + 1}T00-00-00Z.db`;
      writeFileSync(join(backupDir, fName), "fake");
    }

    const result = await runBackup(dbPath, { backupDir, keep: 2 });

    expect(result.rotatedCount).toBe(2);
    const files = readdirSync(backupDir).filter(
      (f) => f.startsWith("kinti-backup-") && f.endsWith(".db")
    );
    expect(files).toHaveLength(2);
    expect(files).toContain(result.path.split(/[\\/]/).pop());
  });
});

describe("listBackups", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `kinti-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when backup dir does not exist", () => {
    expect(listBackups(join(tmpDir, "nonexistent"))).toEqual([]);
  });

  it("parses timestamps from filenames and sorts newest-first", () => {
    const backupDir = join(tmpDir, "backups");
    mkdirSync(backupDir, { recursive: true });

    writeFileSync(join(backupDir, "kinti-backup-2026-03-20T10-00-00Z.db"), "data");
    writeFileSync(join(backupDir, "kinti-backup-2026-03-21T14-30-00Z.db"), "data");
    writeFileSync(join(backupDir, "kinti-backup-pre-restore-2026-03-21T14-25-00Z.db"), "data");

    const backups = listBackups(backupDir);
    expect(backups).toHaveLength(3);

    // In test env _tz defaults to UTC, so local == UTC (without Z suffix)
    expect(backups[0].createdAt).toBe("2026-03-21T14:30:00");
    expect(backups[1].createdAt).toBe("2026-03-21T14:25:00");
    expect(backups[2].createdAt).toBe("2026-03-20T10:00:00");
  });

  it("skips files without a parseable timestamp", () => {
    const backupDir = join(tmpDir, "backups");
    mkdirSync(backupDir, { recursive: true });

    writeFileSync(join(backupDir, "kinti-backup-2026-01-01T00-00-00Z.db"), "data");
    // Legacy format without Z — skipped
    writeFileSync(join(backupDir, "kinti-backup-2026-01-01T00-00-00.db"), "data");
    // Epoch format — skipped
    writeFileSync(join(backupDir, "kinti-backup-pre-restore-1774193571481.db"), "data");
    // Non-backup files — skipped
    writeFileSync(join(backupDir, "random-file.txt"), "data");

    const backups = listBackups(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0].filename).toBe("kinti-backup-2026-01-01T00-00-00Z.db");
  });
});

describe("restoreBackup", () => {
  let tmpDir: string;
  let dbPath: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `kinti-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    backupDir = join(tmpDir, "backups");
    dbPath = join(tmpDir, "test.db");

    const db = new Database(dbPath);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO t VALUES (1)");
    db.close();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("restores a backup and creates a safety backup with Z-suffixed timestamp", async () => {
    const backupResult = await runBackup(dbPath, { backupDir });
    const backupFilename = backupResult.path.split(/[\\/]/).pop()!;

    const db = new Database(dbPath);
    db.exec("INSERT INTO t VALUES (2)");
    const beforeRestore = db.prepare("SELECT * FROM t").all();
    db.close();
    expect(beforeRestore).toHaveLength(2);

    const result = await restoreBackup(dbPath, backupFilename, backupDir);
    expect(result.restoredFrom).toBe(backupFilename);
    expect(result.safetyBackup).toMatch(/^kinti-backup-pre-restore-.*Z\.db$/);

    const restored = new Database(dbPath, { readonly: true });
    const rows = restored.prepare("SELECT * FROM t").all();
    restored.close();
    expect(rows).toHaveLength(1);

    const safety = new Database(join(backupDir, result.safetyBackup), { readonly: true });
    const safetyRows = safety.prepare("SELECT * FROM t").all();
    safety.close();
    expect(safetyRows).toHaveLength(2);
  });

  it("rejects invalid backup filenames", async () => {
    await expect(restoreBackup(dbPath, "evil.db", backupDir)).rejects.toThrow(
      "Invalid backup filename"
    );
  });

  it("rejects non-existent backup files", async () => {
    await expect(
      restoreBackup(dbPath, "kinti-backup-2099-01-01T00-00-00Z.db", backupDir)
    ).rejects.toThrow("Backup file not found");
  });

  it("sanitizes path traversal attempts", async () => {
    await expect(restoreBackup(dbPath, "../../../etc/passwd", backupDir)).rejects.toThrow(
      "Invalid backup filename"
    );
  });
});
