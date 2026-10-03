"use client";

import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { transactionSuggestionsQuery, type SuggestField } from "@/lib/queries/transactions";

const DEBOUNCE_MS = 200;

/**
 * Autocomplete suggestions for a transaction free-text field (`description` or
 * `merchant`) from the FTS5-backed `/api/transactions/suggest` endpoint.
 * Keystrokes are debounced into the query text; the query layer drops answers
 * to text the user has since changed, and keeps the last list on screen while
 * the next one loads. Nothing is fetched until the first `search`.
 */
export function useFieldSuggestions(field: SuggestField): {
  items: string[];
  search: (q: string) => void;
} {
  const [query, setQuery] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useQuery({
    ...transactionSuggestionsQuery(field, query ?? ""),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });

  function search(q: string): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setQuery(q), DEBOUNCE_MS);
  }

  return { items: suggestions.data ?? [], search };
}
