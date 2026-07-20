import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { ok } from "@/lib/mcp/response";

/** Rough check that a SQL statement is read-only. */
function isReadOnly(sqlStr: string): boolean {
  const normalized = sqlStr.trim().toUpperCase();
  return normalized.startsWith("SELECT") || normalized.startsWith("WITH");
}

const DB_CONVENTIONS = [
  "Conventions:",
  "- Dates are TEXT in ISO 8601 format (YYYY-MM-DD or datetime)",
  "- 'tags' columns store JSON arrays as TEXT — query with json_each(tags)",
  "- Transaction type 'transfer' = asset/savings movement with signed amount (negative = cash out/purchase, positive = cash in/sale), excluded from spending/income reports but included in balance calculations",
  "- transactions_fts is an FTS5 virtual table mirroring transactions (description, merchant, notes) for full-text search",
  "- category parent_id enables hierarchical categories (NULL = top-level)",
  "- recurring_transactions are templates; generated transactions link back via recurring_id",
].join("\n");

export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    "get_db_schema",
    {
      description:
        "Return the CREATE TABLE DDL for every user table in the database, plus data conventions. " +
        "Use this before writing a query tool call to get exact column names, types, and semantics.",
      inputSchema: z.object({}),
    },
    () => {
      const client = (getDb() as unknown as { $client: InstanceType<typeof Database> }).$client;
      const rows = client
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE '%\\_fts\\_%' ESCAPE '\\' ORDER BY name"
        )
        .all() as { name: string; sql: string }[];

      return ok({ tables: rows, conventions: DB_CONVENTIONS });
    }
  );

  server.registerTool(
    "query",
    {
      description:
        "Execute a read-only SQL query against the database. " +
        "Only SELECT and WITH (CTE) statements are allowed. " +
        "Use for ad-hoc analysis: window functions, date math, cross-table joins, " +
        "custom aggregations — anything the pre-built tools don't cover.",
      inputSchema: z.object({
        sql: z.string().min(1).max(4000).describe("Read-only SQL statement (SELECT or WITH)"),
      }),
    },
    ({ sql }) => {
      if (!isReadOnly(sql)) {
        throw new Error("Only SELECT and WITH statements are allowed");
      }
      // $client is present at runtime but not on the base type — drizzle adds it via the factory.
      const client = (getDb() as unknown as { $client: InstanceType<typeof Database> }).$client;
      const rows = client.prepare(sql).all();
      return ok(rows);
    }
  );
}
