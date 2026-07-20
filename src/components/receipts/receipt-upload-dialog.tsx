"use client";

import { useRef, useState } from "react";
import { isoToday } from "@/lib/date-ranges";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

interface ReceiptUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new receipt_id after a successful upload. */
  onUploaded: (receiptId: number) => void;
}

export function ReceiptUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: ReceiptUploadDialogProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(isoToday());
  const [total, setTotal] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setFile(null);
    setMerchant("");
    setDate(isoToday());
    setTotal("");
    setError(null);
  }

  function handleOpenChange(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  function acceptFile(f: File): void {
    if (!ALLOWED_TYPES.has(f.type)) {
      setError("Unsupported file type. Use jpg, png, gif, webp, heic, or pdf.");
      return;
    }
    setFile(f);
    setError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(): void {
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }

  async function handleSubmit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (!file) {
      setError("Please select a file.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      if (merchant) form.append("merchant", merchant);
      if (date) form.append("date", date);
      if (total) {
        const parsed = parseFloat(total);
        if (!Number.isNaN(parsed)) form.append("total", String(parsed));
      }

      const res = await fetch("/api/receipts/upload", { method: "POST", body: form });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Upload failed.");
        return;
      }
      const { receipt_id } = (await res.json()) as { receipt_id: number };
      reset();
      onOpenChange(false);
      onUploaded(receipt_id);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Receipt</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Drop zone */}
          <div
            className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-muted-foreground/60"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            aria-label="Upload receipt image"
          >
            <Upload className="text-muted-foreground mx-auto mb-2 size-6" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">Drag and drop or click to select</p>
                <p className="text-muted-foreground mt-1 text-xs">jpg, png, gif, webp, heic, pdf</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.heic"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          {/* Optional metadata */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="receipt-merchant">Merchant (optional)</Label>
              <Input
                id="receipt-merchant"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Lidl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="receipt-date">Date</Label>
              <Input
                id="receipt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="receipt-total">Total (optional)</Label>
              <Input
                id="receipt-total"
                type="number"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="e.g. 43.20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file || uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
