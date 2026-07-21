"use client";

import * as React from "react";
import { useCombobox } from "downshift";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

interface TagsAutocompleteInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  placeholder?: string;
}

const MAX_SUGGESTIONS = 10;

/**
 * A chip/tag input that suggests previously-used tags. Selected tags render as
 * removable chips; the text field autocompletes from the distinct tag list
 * (`/api/transactions/tags`), and free-text tags (Enter or comma) are allowed
 * too. Downshift powers the suggestion menu's keyboard nav + ARIA; the panel is
 * a Radix `Popover` so it stays on-screen and scrollable like the other inputs.
 */
export function TagsAutocompleteInput({
  value,
  onChange,
  id,
  placeholder,
}: TagsAutocompleteInputProps): React.ReactElement {
  const [allTags, setAllTags] = React.useState<string[]>([]);
  const [inputValue, setInputValue] = React.useState("");

  React.useEffect(() => {
    let active = true;
    fetch("/api/transactions/tags")
      .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
      .then((data) => {
        if (active) setAllTags(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        /* suggestions are best-effort */
      });
    return () => {
      active = false;
    };
  }, []);

  function addTag(tag: string): void {
    const t = tag.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInputValue("");
  }

  function removeTag(tag: string): void {
    onChange(value.filter((x) => x !== tag));
  }

  const lower = inputValue.trim().toLowerCase();
  const items = allTags
    .filter((t) => !value.includes(t) && (!lower || t.toLowerCase().includes(lower)))
    .slice(0, MAX_SUGGESTIONS);

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
    closeMenu,
    openMenu,
  } = useCombobox({
    items,
    inputValue,
    selectedItem: null,
    inputId: id,
    itemToString: (item) => item ?? "",
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem != null) addTag(selectedItem);
    },
    stateReducer(state, { changes, type }) {
      // Keep the menu open after picking a tag so several can be added in a row.
      if (
        type === useCombobox.stateChangeTypes.ItemClick ||
        type === useCombobox.stateChangeTypes.InputKeyDownEnter
      ) {
        return { ...changes, isOpen: true, highlightedIndex: 0 };
      }
      // We open on focus; don't let the following input click toggle it closed.
      if (type === useCombobox.stateChangeTypes.InputClick) {
        return { ...changes, isOpen: state.isOpen };
      }
      return changes;
    },
  });

  const open = isOpen && items.length > 0;

  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border bg-transparent px-2 py-1 focus-within:ring-3">
      {value.map((tag) => (
        <span
          key={tag}
          className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => removeTag(tag)}
            className="hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) closeMenu();
        }}
      >
        <PopoverAnchor asChild>
          <div className="min-w-[6rem] flex-1">
            <input
              {...getInputProps({
                className:
                  "placeholder:text-muted-foreground w-full bg-transparent py-0.5 text-sm outline-none",
                placeholder: value.length === 0 ? placeholder : undefined,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setInputValue(e.currentTarget.value),
                onFocus: () => openMenu(),
                onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === ",") {
                    e.preventDefault();
                    addTag(inputValue);
                  } else if (e.key === "Enter" && highlightedIndex < 0 && inputValue.trim()) {
                    // No suggestion highlighted → commit the typed free-text tag.
                    e.preventDefault();
                    addTag(inputValue);
                  } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
                    const last = value[value.length - 1];
                    if (last !== undefined) removeTag(last);
                  }
                },
              })}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Anchor input is outside this content — stop Radix from auto-closing
          // on the focused input (a blink). Downshift owns open/close.
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="max-h-[240px] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-0"
        >
          <ul {...getMenuProps({}, { suppressRefError: true })} className="py-1">
            {items.map((item, index) => (
              <li
                key={item}
                data-testid={`tag-option-${index}`}
                className={cn(
                  "cursor-pointer px-3 py-1.5 text-sm",
                  highlightedIndex === index ? "bg-accent" : "hover:bg-accent"
                )}
                {...getItemProps({ item, index })}
              >
                {item}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
