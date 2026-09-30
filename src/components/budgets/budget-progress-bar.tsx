"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  percentUsed: number;
  className?: string;
}

function getProgressColor(percent: number): string {
  if (percent > 90) return "[&_[data-slot=progress-indicator]]:bg-destructive";
  if (percent >= 60) return "[&_[data-slot=progress-indicator]]:bg-yellow-500";
  return "[&_[data-slot=progress-indicator]]:bg-emerald-500";
}

export function BudgetProgressBar({
  percentUsed,
  className,
}: BudgetProgressBarProps): React.ReactElement {
  // Refunds can take spend below zero; Radix Progress rejects a negative value.
  const displayValue = Math.min(Math.max(percentUsed, 0), 100);

  return (
    <Progress
      value={displayValue}
      className={cn("h-2", getProgressColor(percentUsed), className)}
    />
  );
}
