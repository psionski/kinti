import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError, apiGet, apiSend, apiUpload } from "@/lib/api-client";

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body?: unknown): void {
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiGet", () => {
  it("encodes params into the query string and returns the JSON body", async () => {
    respond(200, { ok: 1 });
    const signal = new AbortController().signal;

    const data = await apiGet("/api/things", { q: "x", n: 2, none: undefined }, { signal });

    expect(data).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/things?q=x&n=2", { signal });
  });

  it("requests the bare path when there are no params", async () => {
    respond(200, []);

    await apiGet("/api/things");

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/things");
  });

  it("throws the API's error contract as an ApiError", async () => {
    respond(404, { error: "Receipt not found", code: "NOT_FOUND" });

    const error = await apiGet("/api/receipts/9").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Receipt not found", status: 404, code: "NOT_FOUND" });
  });

  it("names the status when an error body isn't the contract", async () => {
    respond(502, "<html>bad gateway</html>");

    const error = await apiGet("/api/things").catch((e: unknown) => e);

    expect(error).toMatchObject({ message: "Request failed (502)", status: 502, code: null });
  });
});

describe("apiSend", () => {
  it("sends a JSON body with its content type", async () => {
    respond(201, { id: 1 });

    const data = await apiSend("POST", "/api/things", { name: "a" });

    expect(data).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/things", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name":"a"}',
    });
  });

  it("sends no body or content type when there is nothing to send", async () => {
    respond(200, { success: true });

    await apiSend("DELETE", "/api/things/1");

    expect(fetchMock).toHaveBeenCalledWith("/api/things/1", {
      method: "DELETE",
      headers: undefined,
      body: undefined,
    });
  });

  it("returns undefined for a 204", async () => {
    respond(204);

    await expect(apiSend("POST", "/api/things/reset")).resolves.toBeUndefined();
  });

  it("carries validation details on the error", async () => {
    const details = { issues: [{ path: "amount", message: "Required" }] };
    respond(400, { error: "Validation failed", code: "VALIDATION_ERROR", details });

    await expect(apiSend("POST", "/api/things", {})).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details,
    });
  });
});

describe("apiUpload", () => {
  it("posts the form as-is so the browser sets the multipart boundary", async () => {
    respond(201, { receipt_id: 4 });
    const form = new FormData();
    form.append("merchant", "Lidl");

    const data = await apiUpload("/api/receipts/upload", form);

    expect(data).toEqual({ receipt_id: 4 });
    expect(fetchMock).toHaveBeenCalledWith("/api/receipts/upload", { method: "POST", body: form });
  });
});
