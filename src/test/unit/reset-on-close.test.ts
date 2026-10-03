import { describe, it, expect, vi } from "vitest";
import { resetOnClose } from "@/components/shared/reset-on-close";

describe("resetOnClose", () => {
  it("closes the dialog and clears its mutation when it closes", () => {
    const close = vi.fn();
    const mutation = { reset: vi.fn() };

    resetOnClose(close, mutation)(false);

    expect(close).toHaveBeenCalledOnce();
    expect(mutation.reset).toHaveBeenCalledOnce();
  });

  it("leaves an open request to the parent that opened the dialog", () => {
    const close = vi.fn();
    const mutation = { reset: vi.fn() };

    resetOnClose(close, mutation)(true);

    expect(close).not.toHaveBeenCalled();
    expect(mutation.reset).not.toHaveBeenCalled();
  });
});
