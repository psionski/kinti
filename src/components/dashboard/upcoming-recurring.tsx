import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDate, formatFrequency } from "@/lib/format";
import type { RecurringResponse } from "@/lib/validators/recurring";

interface UpcomingRecurringProps {
  items: RecurringResponse[];
}

export function UpcomingRecurring({ items }: UpcomingRecurringProps): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Recurring</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{item.description}</span>
                  <div className="text-muted-foreground text-xs">{formatFrequency(item)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      item.type === "income" ? "text-emerald-600" : "text-foreground"
                    }`}
                  >
                    {formatCurrency(item.amount, item.currency)}
                  </span>
                  {item.nextOccurrence && (
                    <div className="text-muted-foreground text-xs">
                      {formatDate(item.nextOccurrence)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No upcoming recurring transactions." />
        )}
      </CardContent>
    </Card>
  );
}
