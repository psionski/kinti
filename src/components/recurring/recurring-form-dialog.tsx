"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/categories/category-select-items";
import { CurrencyPicker } from "@/components/settings/currency-picker";
import { getBaseCurrency } from "@/lib/format";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import type { RecurringResponse } from "@/lib/validators/recurring";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface RecurringFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithCountResponse[];
  onSubmit: (data: Record<string, unknown>) => void;
  initialData?: RecurringResponse | null;
  loading?: boolean;
}

export function RecurringFormDialog({
  open,
  onOpenChange,
  categories,
  onSubmit,
  initialData,
  loading,
}: RecurringFormDialogProps): React.ReactElement {
  const isEdit = !!initialData;

  const [type, setType] = useState<string>(initialData?.type ?? "expense");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [amount, setAmount] = useState(initialData ? String(initialData.amount) : "");
  const [currency, setCurrency] = useState<string>(initialData?.currency ?? getBaseCurrency());
  const [merchant, setMerchant] = useState(initialData?.merchant ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    initialData?.categoryId ? String(initialData.categoryId) : ""
  );
  const [frequency, setFrequency] = useState<string>(initialData?.frequency ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(
    initialData?.dayOfMonth != null ? String(initialData.dayOfMonth) : ""
  );
  const [dayOfWeek, setDayOfWeek] = useState(
    initialData?.dayOfWeek != null ? String(initialData.dayOfWeek) : ""
  );
  const [startDate, setStartDate] = useState(initialData?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialData?.endDate ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [error, setError] = useState("");

  function handleFrequencyChange(value: string): void {
    setFrequency(value);
    if (value !== "weekly") setDayOfWeek("");
    if (value !== "monthly") setDayOfMonth("");
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError("");

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }

    if (!startDate) {
      setError("Start date is required.");
      return;
    }

    const data: Record<string, unknown> = {
      type,
      description: description.trim(),
      amount: parsedAmount,
      currency,
      frequency,
      startDate,
    };

    if (merchant.trim()) data.merchant = merchant.trim();
    if (categoryId) data.categoryId = Number(categoryId);
    if (endDate) data.endDate = endDate;
    if (notes.trim()) data.notes = notes.trim();

    if (frequency === "monthly" && dayOfMonth) {
      data.dayOfMonth = Number(dayOfMonth);
    }
    if (frequency === "weekly" && dayOfWeek) {
      data.dayOfWeek = Number(dayOfWeek);
    }

    onSubmit(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Recurring Transaction" : "Add Recurring Transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the recurring template for "${initialData?.description}".`
              : "Create a new recurring transaction template."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recurring-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="recurring-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-description">Description</Label>
            <Input
              id="recurring-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Netflix subscription"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-amount">Amount</Label>
            <Input
              id="recurring-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="9.99"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-currency">Currency</Label>
            <CurrencyPicker id="recurring-currency" value={currency} onChange={setCurrency} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-merchant">Merchant</Label>
            <Input
              id="recurring-merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="recurring-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <CategorySelectItems categories={categories} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-frequency">Frequency</Label>
            <Select value={frequency} onValueChange={handleFrequencyChange}>
              <SelectTrigger id="recurring-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "weekly" && (
            <div className="space-y-2">
              <Label htmlFor="recurring-dow">Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger id="recurring-dow">
                  <SelectValue placeholder="Infer from start date" />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="recurring-dom">Day of Month</Label>
              <Input
                id="recurring-dom"
                type="number"
                min="1"
                max="31"
                placeholder="Infer from start date"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recurring-start">Start Date</Label>
              <Input
                id="recurring-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-end">End Date</Label>
              <Input
                id="recurring-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-notes">Notes</Label>
            <Input
              id="recurring-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
