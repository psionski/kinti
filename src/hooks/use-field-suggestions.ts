"use client";

import { useRef, useState } from "react";

const DEBOUNCE_MS = 200;

/** Fetch suggestions for a field. An empty query returns the most-used values. */
async function fetchSuggestions(
  field: "description" | "merchant",
  q: string,
  signal: AbortSignal
): Promise<string[]> {
  const params = new URLSearchParams({ field });
  const trimmed = q.trim();
  if (trimmed) params.set("q", trimmed);

  const res = await fetch(`/api/transactions/suggest?${params.toString()}`, { signal });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as string[]) : [];
}

/**
 * Fetches autocomplete suggestions for a transaction free-text field
 * (`description` or `merchant`) from the FTS5-backed `/api/transactions/suggest`
 * endpoint. Debounces keystrokes and aborts any in-flight request so only the
 * latest query wins — the same debounce+AbortController shape used by the asset
 * symbol search.
 */
export function useFieldSuggestions(field: "description" | "merchant"): {
  items: string[];
  search: (q: string) => void;
} {
  const [items, setItems] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function run(q: string): void {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetchSuggestions(field, q, controller.signal)
      .then(setItems)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
      });
  }

  function search(q: string): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => run(q), DEBOUNCE_MS);
  }

  return { items, search };
}
