"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The data of each query, in order, once all of them have some. */
type Loaded<Q extends readonly UseQueryResult[]> = {
  -readonly [K in keyof Q]: Q[K] extends UseQueryResult<infer T> ? T : never;
};

interface ReportSectionProps<Q extends readonly UseQueryResult[]> {
  /** Names the section while it has nothing to draw. */
  title: string;
  /** What the section draws from; it draws once every one of them has data. */
  queries: Q;
  children: (...data: Loaded<Q>) => React.ReactNode;
}

/**
 * One section of a report, drawn from its own queries so it loads and fails
 * apart from the others. While new parameters load, the previous result stays
 * on screen, dimmed. A failed query replaces the section with its error, so
 * figures never stay on screen under parameters they weren't computed for.
 */
export function ReportSection<const Q extends readonly UseQueryResult[]>({
  title,
  queries,
  children,
}: ReportSectionProps<Q>): React.ReactElement {
  const error = queries.find((q) => q.isError)?.error;
  if (error || queries.some((q) => q.data === undefined)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Couldn&apos;t load: {error.message}</p>
          ) : (
            <Skeleton className="h-[200px] w-full" />
          )}
        </CardContent>
      </Card>
    );
  }

  const data = queries.map((q) => q.data) as Loaded<Q>;
  const stale = queries.some((q) => q.isPlaceholderData);
  // A one-cell grid, so a card inside a grid row still stretches to the row's
  // height as it would without the wrapper.
  return (
    <div className={cn("grid grid-cols-1", stale && "pointer-events-none opacity-60")}>
      {children(...data)}
    </div>
  );
}
