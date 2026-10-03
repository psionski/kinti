"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useClearSampleData } from "@/lib/queries/settings";

export function SampleDataBar({
  show,
  initiallyHidden = false,
}: {
  show: boolean;
  initiallyHidden?: boolean;
}): React.ReactNode {
  const [refreshing, startRefresh] = useTransition();
  const [hidden, setHidden] = useState(initiallyHidden);
  const router = useRouter();
  const clearSampleData = useClearSampleData();

  useEffect(() => {
    if (!initiallyHidden) return;
    const reveal = (): void => setHidden(false);
    window.addEventListener("tour-complete", reveal);
    return () => window.removeEventListener("tour-complete", reveal);
  }, [initiallyHidden]);

  if (!show || hidden) return null;

  function handleClear(): void {
    const confirmed = window.confirm(
      "This will clear all sample data and reset the app so you can start fresh. Continue?"
    );
    if (!confirmed) return;

    // The server rendered this bar from the deleted database; rendering again
    // against the fresh one sends the app to onboarding.
    clearSampleData.mutate(undefined, { onSuccess: () => startRefresh(() => router.refresh()) });
  }

  const clearing = clearSampleData.isPending || refreshing;

  return (
    <div className="bg-muted w-full border-b px-4 py-2 text-center">
      <span className="text-muted-foreground text-sm">
        You&apos;re viewing <strong className="text-foreground">sample data</strong>. Clear it to
        start tracking your own finances.
      </span>
      <Button
        size="sm"
        variant="destructive"
        className="ml-3"
        disabled={clearing}
        onClick={handleClear}
      >
        {clearing ? "Clearing…" : "Clear sample data"}
      </Button>
      {clearSampleData.error && (
        <p className="text-destructive mt-1 text-sm">{clearSampleData.error.message}</p>
      )}
    </div>
  );
}
