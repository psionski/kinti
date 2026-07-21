import { z } from "zod";
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  ListTransactionsSchema,
  SuggestSchema,
  PaginatedTransactionsResponseSchema,
} from "@/lib/validators/transactions";
import { op, SuccessSchema, Transaction } from "./helpers";
const PaginatedTransactions = PaginatedTransactionsResponseSchema.meta({
  id: "PaginatedTransactions",
});

export const transactionPaths = {
  "/api/transactions": {
    post: op({
      id: "createTransaction",
      summary: "Create a transaction",
      tags: ["Transactions"],
      body: CreateTransactionSchema,
      response: Transaction,
      status: 201,
      errors: [400, 404, 500],
    }),
    get: op({
      id: "listTransactions",
      summary: "List transactions with filters and pagination",
      tags: ["Transactions"],
      query: ListTransactionsSchema,
      response: PaginatedTransactions,
      errors: [400, 500],
    }),
  },
  "/api/transactions/suggest": {
    get: op({
      id: "suggestTransactionFields",
      summary: "Autocomplete suggestions for a free-text field (description or merchant)",
      tags: ["Transactions"],
      query: SuggestSchema,
      response: z.array(z.string()),
      errors: [400, 500],
    }),
  },
  "/api/transactions/{id}": {
    get: op({
      id: "getTransactionById",
      summary: "Get a transaction by ID",
      tags: ["Transactions"],
      pathId: "Transaction ID",
      response: Transaction,
      errors: [400, 404, 500],
    }),
    patch: op({
      id: "updateTransaction",
      summary: "Update a transaction",
      tags: ["Transactions"],
      pathId: "Transaction ID",
      body: UpdateTransactionSchema,
      response: Transaction,
      errors: [400, 404, 500],
    }),
    delete: op({
      id: "deleteTransaction",
      summary: "Delete a transaction",
      tags: ["Transactions"],
      pathId: "Transaction ID",
      response: SuccessSchema,
      errors: [400, 404, 500],
    }),
  },
};
