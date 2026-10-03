"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { receiptQuery, useDeleteReceipt } from "@/lib/queries/receipts";
import { transactionListQuery } from "@/lib/queries/transactions";
import { Temporal } from "@js-temporal/polyfill";
import { isMoneyIn, kindOf } from "@/lib/transaction-kind";

interface ReceiptDialogProps {
  receiptId: number | null;
  onOpenChange: (open: boolean) => void;
}

function formatDate(iso: string): string {
  return Temporal.PlainDate.from(iso.slice(0, 10)).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReceiptDialog({ receiptId, onOpenChange }: ReceiptDialogProps): React.ReactElement {
  return (
    <Dialog open={receiptId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        {/* Keyed so per-receipt state (a failed image) starts over for each receipt. */}
        {receiptId !== null && (
          <ReceiptDetails
            key={receiptId}
            receiptId={receiptId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDetails({
  receiptId,
  onClose,
}: {
  receiptId: number;
  onClose: () => void;
}): React.ReactElement {
  const receipt = useQuery(receiptQuery(receiptId));
  const linkedTxs = useQuery(transactionListQuery({ receiptId, limit: 50, offset: 0 }));
  const deleteReceipt = useDeleteReceipt();
  const [imageError, setImageError] = useState(false);

  function handleDelete(): void {
    if (!confirm("Delete this receipt and its image? Linked transactions will be kept.")) return;
    deleteReceipt.mutate(receiptId, { onSuccess: onClose });
  }

  if (receipt.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }

  if (receipt.isError) {
    return <p className="text-muted-foreground text-sm">{receipt.error.message}</p>;
  }

  const data = receipt.data;
  const linked = linkedTxs.data;

  return (
    <>
      <div className="space-y-4">
        {/* Image */}
        {data.imageUrl && !imageError && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imageUrl}
              alt="Receipt"
              className="max-h-64 w-full rounded-md border object-contain"
              onError={() => setImageError(true)}
            />
            <a
              href={data.imageUrl}
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
          {data.merchant && (
            <>
              <dt className="text-muted-foreground">Merchant</dt>
              <dd className="font-medium">{data.merchant}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Date</dt>
          <dd>{formatDate(data.date)}</dd>
          {data.total !== null && (
            <>
              <dt className="text-muted-foreground">Total</dt>
              <dd>{formatCurrency(data.total)}</dd>
            </>
          )}
        </dl>

        {/* Raw text (collapsible) */}
        {data.rawText && (
          <details className="text-sm">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
              Raw text
            </summary>
            <pre className="bg-muted mt-2 max-h-32 overflow-y-auto rounded p-2 text-xs whitespace-pre-wrap">
              {data.rawText}
            </pre>
          </details>
        )}

        {/* Linked transactions */}
        {linked && linked.data.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Linked transactions ({linked.total})</p>
            <ul className="divide-y text-sm">
              {linked.data.map((tx) => (
                <li key={tx.id} className="flex justify-between py-1.5">
                  <span className="text-muted-foreground max-w-[60%] truncate">
                    {tx.description}
                  </span>
                  <span className={isMoneyIn(kindOf(tx)) ? "text-emerald-600" : ""}>
                    {formatCurrency(Math.abs(tx.amount), tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {linked && linked.data.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No transactions linked to this receipt yet.
          </p>
        )}

        {deleteReceipt.isError && (
          <p className="text-destructive text-sm">{deleteReceipt.error.message}</p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={deleteReceipt.isPending} onClick={handleDelete}>
          {deleteReceipt.isPending ? "Deleting…" : "Delete"}
        </Button>
      </DialogFooter>
    </>
  );
}
