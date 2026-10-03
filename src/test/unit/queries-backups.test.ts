// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { makeQueryClient } from "@/lib/query-client";
import { backupListQuery, useCreateBackup, useRestoreBackup } from "@/lib/queries/backups";
import { RestoreBackupSchema } from "@/lib/validators/backups";

let fetchMock: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let client: QueryClient;

function respond(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

function renderWithClient<T>(hook: () => T) {
  return renderHook(hook, {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  reload = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { reload });
  client = makeQueryClient();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backupListQuery", () => {
  it("reads the list endpoint", async () => {
    const backups = [{ filename: "kinti-backup-a.db", sizeBytes: 10, createdAt: "2026-03-01" }];
    respond(200, backups);

    await expect(client.query(backupListQuery())).resolves.toEqual(backups);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/backups");
  });
});

describe("useCreateBackup", () => {
  it("posts to the list endpoint without a body", async () => {
    respond(201, { filename: "kinti-backup-b.db", rotatedCount: 0 });
    const { result } = renderWithClient(useCreateBackup);

    await result.current.mutateAsync();

    expect(fetchMock).toHaveBeenCalledWith("/api/backups", {
      method: "POST",
      headers: undefined,
      body: undefined,
    });
  });
});

describe("useRestoreBackup", () => {
  it("sends a body the restore route accepts, then reloads the page", async () => {
    respond(200, { restoredFrom: "kinti-backup-a.db", safetyBackup: "kinti-backup-pre.db" });
    const { result } = renderWithClient(useRestoreBackup);

    await result.current.mutateAsync({ filename: "kinti-backup-a.db" });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/backups/restore");
    expect(RestoreBackupSchema.safeParse(JSON.parse(init.body as string)).success).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("stays on the page when the restore is refused", async () => {
    respond(404, { error: "Backup file not found", code: "NOT_FOUND" });
    const { result } = renderWithClient(useRestoreBackup);

    await expect(result.current.mutateAsync({ filename: "kinti-backup-x.db" })).rejects.toThrow(
      "Backup file not found"
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
