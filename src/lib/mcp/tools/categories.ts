import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  RecategorizeSchema,
  MergeCategoriesSchema,
} from "@/lib/validators/categories";
import { IdSchema } from "@/lib/validators/common";
import { getCategoryService } from "@/lib/api/services";
import { ok } from "@/lib/mcp/response";

export function registerCategoryTools(server: McpServer): void {
  server.registerTool(
    "list_categories",
    {
      description:
        "List all categories with hierarchy (parent_id), transaction counts, and metadata.",
      inputSchema: z.object({}),
    },
    () => ok(getCategoryService().getAll())
  );

  server.registerTool(
    "get_category",
    {
      description: "Get a single category by ID with hierarchy info and metadata.",
      inputSchema: IdSchema,
    },
    ({ id }) => {
      const result = getCategoryService().getById(id);
      if (!result) throw new Error(`Category ${id} not found`);
      return ok(result);
    }
  );

  server.registerTool(
    "create_category",
    {
      description: "Create a new category. Optionally set a parent_id for subcategories.",
      inputSchema: CreateCategorySchema,
    },
    (input) => ok(getCategoryService().create(input))
  );

  server.registerTool(
    "update_category",
    {
      description: "Rename, reparent, or change icon/color of a category.",
      inputSchema: IdSchema.extend(UpdateCategorySchema.shape),
    },
    ({ id, ...updates }) => {
      const result = getCategoryService().update(id, updates);
      if (!result) throw new Error(`Category ${id} not found`);
      return ok(result);
    }
  );

  server.registerTool(
    "delete_category",
    {
      description: "Delete a category. Transactions in this category will become uncategorized.",
      inputSchema: IdSchema,
    },
    ({ id }) => {
      const deleted = getCategoryService().delete(id);
      if (!deleted) throw new Error(`Category ${id} not found`);
      return ok({ deleted: true });
    }
  );

  server.registerTool(
    "recategorize_transactions",
    {
      description:
        "Bulk-move transactions matching a filter to a new category. " +
        "At least one filter is required. Use list_categories to find valid category IDs.",
      inputSchema: RecategorizeSchema,
    },
    (input) => {
      const count = getCategoryService().recategorize(input);
      return ok(input.dryRun ? { wouldUpdate: count, dryRun: true } : { updated: count });
    }
  );

  server.registerTool(
    "merge_categories",
    {
      description:
        "Merge source category into target: all transactions are reassigned to target, " +
        "non-conflicting budgets are transferred, and the source category is deleted. " +
        "Subcategories of the source become top-level (their parentId is set to null). " +
        "Returns transactionsMoved and budgetsTransferred counts.",
      inputSchema: MergeCategoriesSchema,
    },
    (input) => ok(getCategoryService().merge(input))
  );
}
