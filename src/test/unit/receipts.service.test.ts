// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { makeTestDb } from "../helpers";
import { ReceiptService } from "@/lib/services/receipts";
import { transactions } from "@/lib/db/schema";
import { isoToday } from "@/lib/date-ranges";

// Mock fs operations — we don't want to write real files in tests
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => Buffer.from("fake-image")),
  unlinkSync: vi.fn(),
}));

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;
let service: ReceiptService;

beforeEach(() => {
  db = makeTestDb();
  service = new ReceiptService(db);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── upload ───────────────────────────────────────────────────────────────────

describe("upload", () => {
  it("creates a receipt row and returns it with an id", () => {
    const result = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    expect(result.id).toBeGreaterThan(0);
    expect(result.date).toBe("2026-03-01");
  });

  it("populates imageUrl based on the receipt id", () => {
    const result = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    expect(result.imageUrl).toBe(`/api/receipts/${result.id}/image`);
  });

  it("stores merchant and total when provided", () => {
    const result = service.upload(Buffer.from("img"), ".png", {
      date: "2026-03-01",
      merchant: "Lidl",
      total: 43.2,
    });
    expect(result.merchant).toBe("Lidl");
    expect(result.total).toBe(43.2);
  });

  it("uses today's date when none is provided", () => {
    const today = isoToday();
    const result = service.upload(Buffer.from("img"), ".jpg", {});
    expect(result.date).toBe(today);
  });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe("getById", () => {
  it("returns the receipt by id", () => {
    const created = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    const found = service.getById(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });

  it("returns null for a non-existent id", () => {
    expect(service.getById(99999)).toBeNull();
  });

  it("returns imageUrl when the receipt has an image", () => {
    const created = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    const found = service.getById(created.id);
    expect(found?.imageUrl).toBe(`/api/receipts/${created.id}/image`);
  });
});

// ─── listUnprocessed ──────────────────────────────────────────────────────────

describe("listUnprocessed", () => {
  it("returns receipts that have no linked transactions", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02" });
    const result = service.listUnprocessed({ limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it("excludes receipts that have at least one linked transaction", () => {
    const r1 = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    const r2 = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02" });

    // Link a transaction to r1
    db.insert(transactions)
      .values({
        amount: 10,
        type: "expense",
        description: "Linked tx",
        date: "2026-03-01",
        receiptId: r1.id,
      })
      .run();

    const result = service.listUnprocessed({ limit: 50, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.data[0]!.id).toBe(r2.id);
  });

  it("returns empty when all receipts are processed", () => {
    const r = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    db.insert(transactions)
      .values({
        amount: 5,
        type: "expense",
        description: "Linked tx",
        date: "2026-03-01",
        receiptId: r.id,
      })
      .run();

    const result = service.listUnprocessed({ limit: 50, offset: 0 });
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("respects pagination", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-03" });

    const page1 = service.listUnprocessed({ limit: 2, offset: 0 });
    expect(page1.data).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = service.listUnprocessed({ limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });
});

// ─── list ────────────────────────────────────────────────────────────────────

describe("list", () => {
  it("returns all receipts", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02" });
    const result = service.list({ limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it("respects pagination", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-03" });

    const page1 = service.list({ limit: 2, offset: 0 });
    expect(page1.data).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = service.list({ limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it("returns empty when no receipts exist", () => {
    const result = service.list({ limit: 50, offset: 0 });
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("filters by dateFrom", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-01-15" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-10" });
    const result = service.list({ limit: 50, offset: 0, dateFrom: "2026-03-01" });
    expect(result.total).toBe(1);
    expect(result.data[0]!.date).toBe("2026-03-10");
  });

  it("filters by dateTo", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-01-15" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-10" });
    const result = service.list({ limit: 50, offset: 0, dateTo: "2026-02-01" });
    expect(result.total).toBe(1);
    expect(result.data[0]!.date).toBe("2026-01-15");
  });

  it("filters by merchant substring", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01", merchant: "Lidl Berlin" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02", merchant: "Rewe Hamburg" });
    const result = service.list({ limit: 50, offset: 0, merchant: "Lidl" });
    expect(result.total).toBe(1);
    expect(result.data[0]!.merchant).toBe("Lidl Berlin");
  });

  it("combines multiple filters", () => {
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-01-15", merchant: "Lidl" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-10", merchant: "Lidl" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-10", merchant: "Rewe" });
    const result = service.list({ limit: 50, offset: 0, dateFrom: "2026-03-01", merchant: "Lidl" });
    expect(result.total).toBe(1);
    expect(result.data[0]!.date).toBe("2026-03-10");
  });
});

// ─── createMetadataOnly ──────────────────────────────────────────────────────

describe("createMetadataOnly", () => {
  it("creates a receipt without an image", () => {
    const result = service.createMetadataOnly({
      date: "2026-03-01",
      merchant: "Lidl",
      total: 25,
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.date).toBe("2026-03-01");
    expect(result.merchant).toBe("Lidl");
    expect(result.total).toBe(25);
    expect(result.imageUrl).toBeNull();
  });

  it("uses today's date when none provided", () => {
    const today = isoToday();
    const result = service.createMetadataOnly({});
    expect(result.date).toBe(today);
  });

  it("stores rawText when provided", () => {
    const result = service.createMetadataOnly({
      date: "2026-03-01",
      rawText: "receipt line items",
    });
    expect(result.rawText).toBe("receipt line items");
  });

  it("is retrievable via getById", () => {
    const created = service.createMetadataOnly({ date: "2026-03-01" });
    const found = service.getById(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });
});

// ─── getImage ────────────────────────────────────────────────────────────────

describe("getImage", () => {
  it("returns buffer and content type for a receipt with an image", () => {
    const created = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    const result = service.getImage(created.id);
    expect(result).not.toBeNull();
    expect(result?.buffer).toBeInstanceOf(Buffer);
    expect(result?.contentType).toBe("image/jpeg");
  });

  it("returns null for a receipt with no image (metadata-only)", () => {
    const created = service.createMetadataOnly({ date: "2026-03-01" });
    const result = service.getImage(created.id);
    expect(result).toBeNull();
  });

  it("returns null for a non-existent receipt", () => {
    expect(service.getImage(99999)).toBeNull();
  });

  it("returns null when image file is missing on disk", async () => {
    const { existsSync } = await import("fs");
    const created = service.upload(Buffer.from("img"), ".png", { date: "2026-03-01" });

    // Simulate file missing on disk
    vi.mocked(existsSync).mockReturnValueOnce(false);
    const result = service.getImage(created.id);
    expect(result).toBeNull();
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("delete", () => {
  it("deletes a receipt by id and returns true", () => {
    const created = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    expect(service.delete(created.id)).toBe(true);
    expect(service.getById(created.id)).toBeNull();
  });

  it("returns false for a non-existent id", () => {
    expect(service.delete(99999)).toBe(false);
  });

  it("unlinks transactions (SET NULL) when receipt is deleted", () => {
    const r = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    db.insert(transactions)
      .values({
        amount: 10,
        type: "expense",
        description: "Linked tx",
        date: "2026-03-01",
        receiptId: r.id,
      })
      .run();

    service.delete(r.id);

    const [tx] = db.select().from(transactions).all();
    expect(tx!.receiptId).toBeNull();
  });

  it("calls unlinkSync for the image file", async () => {
    const { unlinkSync } = await import("fs");
    const created = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    service.delete(created.id);
    expect(unlinkSync).toHaveBeenCalled();
  });
});

// ─── batchDelete ─────────────────────────────────────────────────────────────

describe("batchDelete", () => {
  it("deletes multiple receipts and returns the count", () => {
    const r1 = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    const r2 = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-02" });
    service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-03" });

    const deleted = service.batchDelete([r1.id, r2.id]);
    expect(deleted).toBe(2);
    expect(service.getById(r1.id)).toBeNull();
    expect(service.getById(r2.id)).toBeNull();
    expect(service.list({ limit: 50, offset: 0 }).total).toBe(1);
  });

  it("returns 0 when no ids match", () => {
    expect(service.batchDelete([99998, 99999])).toBe(0);
  });

  it("ignores non-existent ids in the batch", () => {
    const r1 = service.upload(Buffer.from("img"), ".jpg", { date: "2026-03-01" });
    const deleted = service.batchDelete([r1.id, 99999]);
    expect(deleted).toBe(1);
  });
});
