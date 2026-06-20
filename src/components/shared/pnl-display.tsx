import { TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface PnlDisplayProps {
  pnl: number | null;
  label?: string;
  size?: "sm" | "default";
  /** Optional tooltip — used to surface the native-currency P&L next to a base-currency display. */
  title?: string;
}

export function PnlDisplay({
  pnl,
  label,
  size = "default",
  title,
}: PnlDisplayProps): React.ReactElement {
  if (pnl === null) return <span className="text-muted-foreground">—</span>;

  const positive = pnl >= 0;
  const iconClass = size === "sm" ? "size-3.5" : "size-4";
  const textClass =
    size === "sm"
      ? "flex items-center gap-1 text-sm font-medium"
      : "flex items-center gap-1 font-semibold";

  return (
    <span
      className={`${textClass} ${positive ? "text-emerald-600" : "text-destructive"}`}
      title={title}
    >
      {positive ? <TrendingUp className={iconClass} /> : <TrendingDown className={iconClass} />}
      {label && <span className="text-muted-foreground mr-1 text-xs font-normal">{label}</span>}
      {positive ? "+" : ""}
      {formatCurrency(pnl)}
    </span>
  );
}
