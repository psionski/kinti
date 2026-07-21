"use client";

import * as React from "react";
import { useCombobox } from "downshift";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useFieldSuggestions } from "@/hooks/use-field-suggestions";

interface AutocompleteInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  /** Which transaction field to pull previously-used suggestions from. */
  field: "description" | "merchant";
}

/**
 * A drop-in `<Input>` replacement that suggests previously-used values as the
 * user types. Downshift's `useCombobox` owns keyboard nav, focus and ARIA
 * (focus stays in the input via `aria-activedescendant`); the suggestion panel
 * is a Radix `Popover` anchored to the field, so it's portaled with collision
 * handling and stays on-screen + scrollable on both desktop and mobile.
 */
export function AutocompleteInput({
  value,
  onChange,
  field,
  id,
  ...inputProps
}: AutocompleteInputProps): React.ReactElement {
  const { items, search } = useFieldSuggestions(field);

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
    inputValue: value,
    // Free-text field: we never "commit" a selection, the input holds any text.
    selectedItem: null,
    inputId: id,
    itemToString: (item) => item ?? "",
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem != null) onChange(selectedItem);
    },
    // We open the menu on focus (see onFocus). Downshift v8's ARIA behavior
    // toggles the menu on input click, which — since the click follows focus —
    // would immediately close the just-opened menu. Preserve the open state on
    // click instead (the documented "open on focus" pattern).
    stateReducer(state, { changes, type }) {
      if (type === useCombobox.stateChangeTypes.InputClick) {
        return { ...changes, isOpen: state.isOpen };
      }
      return changes;
    },
  });

  // Only float the panel when there's something to show — avoids an empty box.
  const open = isOpen && items.length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) closeMenu();
      }}
    >
      <PopoverAnchor asChild>
        <div className="w-full">
          <Input
            {...inputProps}
            {...getInputProps({
              // Set the controlled value via onChange (not onInputValueChange) to
              // avoid the cursor-jump bug in controlled downshift inputs.
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                onChange(e.currentTarget.value);
                search(e.currentTarget.value);
              },
              onFocus: () => {
                search(value);
                openMenu();
              },
            })}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        // Keep focus in the input rather than moving it into the panel.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The anchor input lives *outside* this content, so Radix would treat
        // the focused input as "focus outside" and auto-dismiss the panel the
        // instant it opens (a blink). Let downshift own open/close instead —
        // it closes on blur, Escape and selection.
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[280px] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-0"
      >
        <ul {...getMenuProps({}, { suppressRefError: true })} className="py-1">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              data-testid={`autocomplete-option-${index}`}
              className={cn(
                "flex cursor-pointer items-center px-3 py-1.5 text-sm",
                highlightedIndex === index ? "bg-accent" : "hover:bg-accent"
              )}
              {...getItemProps({ item, index })}
            >
              <span className="truncate">{item}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
