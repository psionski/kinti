"use client";

import { useState, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ALL_TIMEZONES = Intl.supportedValuesOf("timeZone");

interface TimezonePickerProps {
  value: string;
  onChange: (tz: string) => void;
}

export function TimezonePicker({ value, onChange }: TimezonePickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (next) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const lower = search.toLowerCase();
  const filtered = search
    ? ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(lower))
    : ALL_TIMEZONES;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          {value || "Select timezone..."}
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2">
          <Input
            ref={inputRef}
            placeholder="Search timezones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto border-t">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground p-3 text-center text-sm">No timezones found</div>
          ) : (
            filtered.map((tz) => (
              <button
                key={tz}
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  onChange(tz);
                  setOpen(false);
                }}
              >
                <Check
                  className={`size-3.5 shrink-0 ${tz === value ? "opacity-100" : "opacity-0"}`}
                />
                {tz}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
