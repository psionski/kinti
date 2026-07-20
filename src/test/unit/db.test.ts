// @vitest-environment node
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import path from "path";
import * as schema from "@/lib/db/schema";
import { createDb, ensureFtsTriggers } from "@/lib/db/index";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../drizzle");

const DEFAULT_CATEGORIES = [
  { name: "Groceries", icon: "🛒", color: "#4ade80" },
  { name: "Rent", icon: "🏠", color: "#60a5fa" },
  { name: "Utilities", icon: "💡", color: "#facc15" },
  { name: "Transport", icon: "🚗", color: "#f97316" },
  { name: "Entertainment", icon: "🎬", color: "#a78bfa" },
  { name: "Dining", icon: "🍽️", color: "#fb7185" },
  { name: "Health", icon: "❤️", color: "#f43f5e" },
  { name: "Shopping", icon: "🛍️", color: "#e879f9" },
  { name: "Subscriptions", icon: "📱", color: "#38bdf8" },
  { name: "Income", icon: "💰", color: "#34d399" },
  { name: "Other", icon: "📦", color: "#94a3b8" },
];

function makeTestDb() {
  const client = new Database(":memory:");
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  ensureFtsTriggers(client);
  return db;
}

describe("Database", () => {
  describe("connection and migration", () => {
    it("connects and applies migrations (all tables exist)", () => {
      const db = makeTestDb();

      // Verify each table by querying it — if migration failed these would throw
      expect(() => db.select().from(schema.categories).all()).not.toThrow();
      expect(() => db.select().from(schema.transactions).all()).not.toThrow();
      expect(() => db.select().from(schema.receipts).all()).not.toThrow();
      expect(() => db.select().from(schema.budgets).all()).not.toThrow();
      expect(() => db.select().from(schema.recurringTransactions).all()).not.toThrow();
    });

    it("createDb() returns a working connection", () => {
      const db = createDb(":memory:");
      // We can't run migrations via createDb alone, but we can confirm it returns a drizzle instance
      expect(db).toBeDefined();
    });
  });

  describe("seed (categories)", () => {
    it("inserts all default categories", () => {
      const db = makeTestDb();

      for (const cat of DEFAULT_CATEGORIES) {
        db.insert(schema.categories).values(cat).run();
      }

      const rows = db.select().from(schema.categories).all();
      expect(rows).toHaveLength(DEFAULT_CATEGORIES.length);
      const names = rows.map((r) => r.name);
      expect(names).toContain("Groceries");
      expect(names).toContain("Income");
      expect(names).toContain("Other");
    });

    it("onConflictDoNothing does not duplicate categories on re-seed", () => {
      const db = makeTestDb();

      for (const cat of DEFAULT_CATEGORIES) {
        db.insert(schema.categories).values(cat).onConflictDoNothing().run();
      }
      // Run seed a second time
      for (const cat of DEFAULT_CATEGORIES) {
        db.insert(schema.categories).values(cat).onConflictDoNothing().run();
      }

      const rows = db.select().from(schema.categories).all();
      expect(rows).toHaveLength(DEFAULT_CATEGORIES.length);
    });
  });

  describe("transactions CRUD", () => {
    it("inserts and retrieves a transaction", () => {
      const db = makeTestDb();

      db.insert(schema.transactions)
        .values({
          amount: 1250,
          type: "expense",
          description: "Morning coffee",
          merchant: "Starbucks",
          date: "2026-03-17",
        })
        .run();

      const rows = db.select().from(schema.transactions).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.amount).toBe(1250);
      expect(rows[0]!.description).toBe("Morning coffee");
      expect(rows[0]!.merchant).toBe("Starbucks");
    });

    it("updates a transaction", () => {
      const db = makeTestDb();

      const [inserted] = db
        .insert(schema.transactions)
        .values({ amount: 500, type: "expense", description: "Bus ticket", date: "2026-03-17" })
        .returning()
        .all();

      db.update(schema.transactions)
        .set({ amount: 600, description: "Bus ticket (updated)" })
        .where(eq(schema.transactions.id, inserted!.id))
        .run();

      const [updated] = db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, inserted!.id))
        .all();

      expect(updated!.amount).toBe(600);
      expect(updated!.description).toBe("Bus ticket (updated)");
    });

    it("deletes a transaction", () => {
      const db = makeTestDb();

      const [inserted] = db
        .insert(schema.transactions)
        .values({ amount: 999, type: "expense", description: "Delete me", date: "2026-03-17" })
        .returning()
        .all();

      db.delete(schema.transactions).where(eq(schema.transactions.id, inserted!.id)).run();

      const rows = db.select().from(schema.transactions).all();
      expect(rows).toHaveLength(0);
    });

    it("enforces foreign key: category_id must reference an existing category", () => {
      const db = makeTestDb();

      expect(() =>
        db
          .insert(schema.transactions)
          .values({
            amount: 100,
            type: "expense",
            description: "Bad FK",
            date: "2026-03-17",
            categoryId: 9999,
          })
          .run()
      ).toThrow();
    });
  });

  describe("full-text search (FTS5)", () => {
    it("FTS trigger inserts into transactions_fts on insert", () => {
      const db = makeTestDb();

      db.insert(schema.transactions)
        .values({
          amount: 800,
          type: "expense",
          description: "Supermarket weekly shop",
          merchant: "ALDI",
          date: "2026-03-17",
        })
        .run();

      // Access the underlying better-sqlite3 client via the internal drizzle structure
      // We use a raw SQL query to verify FTS
      const rawClient = Object.values(db).find(
        (v) => v && typeof v === "object" && typeof (v as Database.Database).prepare === "function"
      ) as Database.Database | undefined;

      expect(rawClient).toBeDefined();
      if (!rawClient) return;

      const results = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("supermarket");

      expect(results).toHaveLength(1);
    });

    it("FTS returns results for merchant search", () => {
      const db = makeTestDb();

      db.insert(schema.transactions)
        .values([
          {
            amount: 400,
            type: "expense",
            description: "Lunch",
            merchant: "McDonald's",
            date: "2026-03-17",
          },
          {
            amount: 200,
            type: "expense",
            description: "Coffee",
            merchant: "Costa Coffee",
            date: "2026-03-17",
          },
        ])
        .run();

      const rawClient = Object.values(db).find(
        (v) => v && typeof v === "object" && typeof (v as Database.Database).prepare === "function"
      ) as Database.Database | undefined;

      expect(rawClient).toBeDefined();
      if (!rawClient) return;

      const results = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("costa");

      expect(results).toHaveLength(1);
    });

    it("FTS update trigger keeps index in sync after update", () => {
      const db = makeTestDb();

      const [tx] = db
        .insert(schema.transactions)
        .values({
          amount: 100,
          type: "expense",
          description: "Old description",
          date: "2026-03-17",
        })
        .returning()
        .all();

      db.update(schema.transactions)
        .set({ description: "New description after update" })
        .where(eq(schema.transactions.id, tx!.id))
        .run();

      const rawClient = Object.values(db).find(
        (v) => v && typeof v === "object" && typeof (v as Database.Database).prepare === "function"
      ) as Database.Database | undefined;

      expect(rawClient).toBeDefined();
      if (!rawClient) return;

      const oldResults = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("Old");
      const newResults = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("New");

      expect(oldResults).toHaveLength(0);
      expect(newResults).toHaveLength(1);
    });

    it("FTS delete trigger removes entry from index after delete", () => {
      const db = makeTestDb();

      const [tx] = db
        .insert(schema.transactions)
        .values({
          amount: 100,
          type: "expense",
          description: "Temporary entry",
          date: "2026-03-17",
        })
        .returning()
        .all();

      db.delete(schema.transactions).where(eq(schema.transactions.id, tx!.id)).run();

      const rawClient = Object.values(db).find(
        (v) => v && typeof v === "object" && typeof (v as Database.Database).prepare === "function"
      ) as Database.Database | undefined;

      expect(rawClient).toBeDefined();
      if (!rawClient) return;

      const results = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("Temporary");

      expect(results).toHaveLength(0);
    });

    it("FTS indexes category name for search", () => {
      const db = makeTestDb();

      const [cat] = db
        .insert(schema.categories)
        .values({ name: "Groceries", icon: "cart" })
        .returning()
        .all();

      db.insert(schema.transactions)
        .values({
          amount: 500,
          type: "expense",
          description: "Weekly shop",
          categoryId: cat!.id,
          date: "2026-03-17",
        })
        .run();

      const rawClient = Object.values(db).find(
        (v) => v && typeof v === "object" && typeof (v as Database.Database).prepare === "function"
      ) as Database.Database | undefined;
      expect(rawClient).toBeDefined();
      if (!rawClient) return;

      const results = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("Groceries");
      expect(results).toHaveLength(1);
    });

    it("FTS updates when category is renamed", () => {
      const db = makeTestDb();

      const [cat] = db
        .insert(schema.categories)
        .values({ name: "Food", icon: "utensils" })
        .returning()
        .all();

      db.insert(schema.transactions)
        .values({
          amount: 500,
          type: "expense",
          description: "Lunch",
          categoryId: cat!.id,
          date: "2026-03-17",
        })
        .run();

      // Rename category
      db.update(schema.categories)
        .set({ name: "Dining" })
        .where(eq(schema.categories.id, cat!.id))
        .run();

      const rawClient = Object.values(db).find(
        (v) => v && typeof v === "object" && typeof (v as Database.Database).prepare === "function"
      ) as Database.Database | undefined;
      expect(rawClient).toBeDefined();
      if (!rawClient) return;

      const oldResults = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("Food");
      const newResults = rawClient
        .prepare("SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?")
        .all("Dining");

      expect(oldResults).toHaveLength(0);
      expect(newResults).toHaveLength(1);
    });
  });
});
