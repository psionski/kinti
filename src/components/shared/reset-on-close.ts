/**
 * A controlled dialog's `onOpenChange` that, when the dialog closes, also
 * clears the mutation behind it — so reopening shows a fresh form rather than
 * the last attempt's error. Dialogs here are opened by their parent, so an
 * open request needs no handling.
 */
export function resetOnClose(
  close: () => void,
  mutation: { reset: () => void }
): (open: boolean) => void {
  return (open) => {
    if (open) return;
    close();
    mutation.reset();
  };
}
