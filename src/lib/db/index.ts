import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import * as schema from "./schema";
import { dbLogger } from "@/lib/logger";

export type AppDb = BetterSQLite3Database<typeof schema>;

const DB_PATH = process.env.DATABASE_URL ?? "./data/kinti.db";

/**
 * Idempotently (re)creates FTS5 sync triggers for the transactions table.
 *
 * Drizzle Kit doesn't track custom triggers, so any migration that recreates
 * the transactions table (e.g. adding a CHECK constraint) silently drops them.
 * Call this after migrations and on app startup to guarantee FTS stays in sync.
 */
export function ensureFtsTriggers(client: InstanceType<typeof Database>): void {
  client.exec(`
    DROP TRIGGER IF EXISTS transactions_ai;
    DROP TRIGGER IF EXISTS transactions_ad;
    DROP TRIGGER IF EXISTS transactions_au;
    DROP TRIGGER IF EXISTS categories_au_fts;
    DROP TRIGGER IF EXISTS categories_ad_fts;

    -- Transaction INSERT: index text fields + joined category name
    CREATE TRIGGER transactions_ai AFTER INSERT ON transactions BEGIN
      INSERT INTO transactions_fts(rowid, description, merchant, notes, category_name)
      VALUES (
        new.id, new.description, new.merchant, new.notes,
        COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
      );
    END;

    -- Transaction DELETE: remove from FTS (must supply old content for contentless table)
    CREATE TRIGGER transactions_ad AFTER DELETE ON transactions BEGIN
      INSERT INTO transactions_fts(transactions_fts, rowid, description, merchant, notes, category_name)
      VALUES (
        'delete', old.id, old.description, old.merchant, old.notes,
        COALESCE((SELECT name FROM categories WHERE id = old.category_id), '')
      );
    END;

    -- Transaction UPDATE: delete old entry, insert new
    CREATE TRIGGER transactions_au AFTER UPDATE ON transactions BEGIN
      INSERT INTO transactions_fts(transactions_fts, rowid, description, merchant, notes, category_name)
      VALUES (
        'delete', old.id, old.description, old.merchant, old.notes,
        COALESCE((SELECT name FROM categories WHERE id = old.category_id), '')
      );
      INSERT INTO transactions_fts(rowid, description, merchant, notes, category_name)
      VALUES (
        new.id, new.description, new.merchant, new.notes,
        COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
      );
    END;

    -- Category rename: re-index all transactions in that category
    CREATE TRIGGER categories_au_fts AFTER UPDATE OF name ON categories BEGIN
      INSERT INTO transactions_fts(transactions_fts, rowid, description, merchant, notes, category_name)
        SELECT 'delete', t.id, t.description, t.merchant, t.notes, old.name
        FROM transactions t WHERE t.category_id = old.id;
      INSERT INTO transactions_fts(rowid, description, merchant, notes, category_name)
        SELECT t.id, t.description, t.merchant, t.notes, new.name
        FROM transactions t WHERE t.category_id = new.id;
    END;

    -- Category delete: re-index affected transactions with empty category name
    CREATE TRIGGER categories_ad_fts AFTER DELETE ON categories BEGIN
      INSERT INTO transactions_fts(transactions_fts, rowid, description, merchant, notes, category_name)
        SELECT 'delete', t.id, t.description, t.merchant, t.notes, old.name
        FROM transactions t WHERE t.category_id = old.id;
      INSERT INTO transactions_fts(rowid, description, merchant, notes, category_name)
        SELECT t.id, t.description, t.merchant, t.notes, ''
        FROM transactions t WHERE t.category_id = old.id;
    END;
  `);
}

function initClient(path: string): InstanceType<typeof Database> {
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);

  client.pragma("journal_mode = WAL");
  client.pragma("synchronous = NORMAL");
  client.pragma("foreign_keys = ON");
  client.pragma("cache_size = -64000");
  client.pragma("busy_timeout = 5000");

  return client;
}

// Singleton for the application DB connection stored on globalThis so it
// survives Next.js re-bundling across server components and API routes.
// In tests, use createDb() directly with a separate path/in-memory DB.
const g = globalThis as unknown as { __kintiDb?: AppDb };

/** App-level singleton. Runs pending migrations on first call. */
export function getDb(): AppDb {
  if (!g.__kintiDb) {
    const client = initClient(DB_PATH);
    const db = drizzle({ client, schema });
    migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
    dbLogger.debug("Migrations applied");
    ensureFtsTriggers(client);
    dbLogger.debug("FTS triggers ensured");
    g.__kintiDb = db;
    dbLogger.info({ path: DB_PATH }, "Database initialized");
  }
  return g.__kintiDb;
}

/**
 * Close the current DB connection and clear the singleton so the next
 * `getDb()` call reinitializes from the on-disk file. Used after restore
 * to pick up the new database without a server restart.
 */
export function resetDb(): void {
  if (g.__kintiDb) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = (g.__kintiDb as any).$client as InstanceType<typeof Database>;
      client.close();
    } catch {
      // Connection may already be closed — safe to ignore
    }
    g.__kintiDb = undefined;
    dbLogger.info("Database connection reset");
  }
}

/** Create a fresh DB connection — use in tests or for alternate DB paths. */
export function createDb(path: string): AppDb {
  const client = initClient(path);
  return drizzle({ client, schema });
}

export { schema };
