import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatPrice } from "@/lib/format";
import type { AssetLotResponse } from "@/lib/validators/assets";

interface LotHistoryTableProps {
  lots: AssetLotResponse[];
  currency: string;
  assetType?: "deposit" | "investment" | "crypto" | "other";
}

export function LotHistoryTable({
  lots,
  currency,
  assetType,
}: LotHistoryTableProps): React.ReactElement {
  if (lots.length === 0) {
    return <EmptyState message="No transactions recorded yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="pr-4 pb-2 font-medium">Date</th>
            <th className="pr-4 pb-2 font-medium">Type</th>
            <th className="pr-4 pb-2 text-right font-medium">Quantity</th>
            <th className="hidden pr-4 pb-2 text-right font-medium md:table-cell">Price / unit</th>
            <th className="pb-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const isBuy = lot.quantity > 0;
            const total = Math.abs(lot.quantity) * lot.pricePerUnit;
            return (
              <tr key={lot.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{lot.date}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                      isBuy
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {assetType === "deposit"
                      ? isBuy
                        ? "Deposit"
                        : "Withdrawal"
                      : isBuy
                        ? "Buy"
                        : "Sell"}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {isBuy ? "+" : "−"}
                  {Math.abs(lot.quantity)}
                </td>
                <td className="hidden py-2 pr-4 text-right font-mono md:table-cell">
                  {formatPrice(lot.pricePerUnit)} {currency}
                </td>
                <td className="py-2 text-right font-mono">{formatCurrency(Math.round(total))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
