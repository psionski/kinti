"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { Temporal } from "@js-temporal/polyfill";
import {
  DEFAULT_PRESET,
  PRESET_LABELS,
  computePresetRange,
  computeCompareRange,
  type Preset,
  type ComputedRange,
} from "@/lib/date-ranges";

interface DateRangeFilterProps {
  onChange: (range: ComputedRange) => void;
}

export function DateRangeFilter({ onChange }: DateRangeFilterProps): React.ReactElement {
  const [activePreset, setActivePreset] = useState<Preset>(DEFAULT_PRESET);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const presets = Object.keys(PRESET_LABELS) as Preset[];

  function handlePreset(preset: Preset): void {
    setActivePreset(preset);
    if (preset !== "custom") {
      const range = computePresetRange(preset);
      onChange(computeCompareRange(range));
    }
  }

  function handleCustomChange(from: string, to: string): void {
    if (from && to && from <= to) {
      const [toYear, toMonth] = to.split("-").map(Number);
      const lastDay = Temporal.PlainYearMonth.from({ year: toYear, month: toMonth }).daysInMonth;
      onChange(
        computeCompareRange({
          dateFrom: `${from}-01`,
          dateTo: `${to}-${String(lastDay).padStart(2, "0")}`,
        })
      );
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset}
            variant={activePreset === preset ? "default" : "outline"}
            size="sm"
            onClick={() => handlePreset(preset)}
          >
            {PRESET_LABELS[preset]}
          </Button>
        ))}
      </div>

      {activePreset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">From:</span>
          <MonthPicker
            value={customFrom}
            onChange={(v) => {
              setCustomFrom(v);
              handleCustomChange(v, customTo);
            }}
          />
          <span className="text-muted-foreground">to</span>
          <MonthPicker
            value={customTo}
            onChange={(v) => {
              setCustomTo(v);
              handleCustomChange(customFrom, v);
            }}
          />
        </div>
      )}
    </div>
  );
}
