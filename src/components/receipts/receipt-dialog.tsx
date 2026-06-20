"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { ReceiptResponse } from "@/lib/validators/receipts";
import type { PaginatedTransactionsResponse } from "@/lib/validators/transactions";
import { Temporal } from "@js-temporal/polyfill";

interface ReceiptDialogProps {
  receiptId: number | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

function formatDate(iso: string): string {
  return Temporal.PlainDate.from(iso.slice(0, 10)).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReceiptDialog({
  receiptId,
  onOpenChange,
  onDeleted,
}: ReceiptDialogProps): React.ReactElement {
  const open = receiptId !== null;
  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [linkedTxs, setLinkedTxs] = useState<PaginatedTransactionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(): Promise<void> {
    if (
      !receiptId ||
      !confirm("Delete this receipt and its image? Linked transactions will be kept.")
    )
      return;
    setDeleting(true);
    const res = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      onOpenChange(false);
      onDeleted?.();
    }
  }

  useEffect(() => {
    if (!receiptId) return;
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      const [rec, txs] = await Promise.all([
        fetch(`/api/receipts/${receiptId}`).then((r) =>
          r.ok ? (r.json() as Promise<ReceiptResponse>) : null
        ),
        fetch(`/api/transactions?receiptId=${receiptId}&limit=50&offset=0`).then((r) =>
          r.ok ? (r.json() as Promise<PaginatedTransactionsResponse>) : null
        ),
      ]);
      if (cancelled) return;
      setReceipt(rec);
      setLinkedTxs(txs);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-md" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        )}

        {!loading && receipt && (
          <div className="space-y-4">
            {/* Image */}
            {receipt.imageUrl && !imageError && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.imageUrl}
                  alt="Receipt"
                  className="max-h-64 w-full rounded-md border object-contain"
                  onError={() => setImageError(true)}
                />
                <a
                  href={receipt.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-background/80 hover:bg-background absolute top-2 right-2 rounded p-1"
                  aria-label="Open image in new tab"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}

            {/* Metadata */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {receipt.merchant && (
                <>
                  <dt className="text-muted-foreground">Merchant</dt>
                  <dd className="font-medium">{receipt.merchant}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatDate(receipt.date)}</dd>
              {receipt.total !== null && (
                <>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd>{formatCurrency(receipt.total)}</dd>
                </>
              )}
            </dl>

            {/* Raw text (collapsible) */}
            {receipt.rawText && (
              <details className="text-sm">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                  Raw text
                </summary>
                <pre className="bg-muted mt-2 max-h-32 overflow-y-auto rounded p-2 text-xs whitespace-pre-wrap">
                  {receipt.rawText}
                </pre>
              </details>
            )}

            {/* Linked transactions */}
            {linkedTxs && linkedTxs.data.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Linked transactions ({linkedTxs.total})</p>
                <ul className="divide-y text-sm">
                  {linkedTxs.data.map((tx) => (
                    <li key={tx.id} className="flex justify-between py-1.5">
                      <span className="text-muted-foreground max-w-[60%] truncate">
                        {tx.description}
                      </span>
                      <span className={tx.type === "income" ? "text-emerald-600" : ""}>
                        {formatCurrency(tx.amount, tx.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {linkedTxs && linkedTxs.data.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No transactions linked to this receipt yet.
              </p>
            )}
          </div>
        )}

        {!loading && !receipt && (
          <p className="text-muted-foreground text-sm">Receipt not found.</p>
        )}

        {!loading && receipt && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
