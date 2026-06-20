"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { setBaseCurrencyCache } from "@/lib/format";
import type { BackupInfo } from "@/lib/services/backup";
import { Section } from "./settings-section";
import { TimezonePicker } from "./timezone-picker";
import { CurrencyPicker } from "./currency-picker";
import { CashBalanceSection } from "./cash-balance-section";
import { SavingsSection } from "./savings-section";
import { InvestmentsSection } from "./investments-section";
import { ProvidersSection } from "./providers-section";
import { BackupManager } from "./backup-manager";

// ─── Onboarding steps (after timezone + base currency) ──────────────────────

type OnboardingStep =
  | "base-currency"
  | "cash"
  | "savings"
  | "investments"
  | "providers"
  | "backups"
  | "done";
const ONBOARDING_ORDER: OnboardingStep[] = [
  "base-currency",
  "cash",
  "savings",
  "investments",
  "providers",
  "backups",
  "done",
];

function nextStep(current: OnboardingStep): OnboardingStep {
  const idx = ONBOARDING_ORDER.indexOf(current);
  return ONBOARDING_ORDER[Math.min(idx + 1, ONBOARDING_ORDER.length - 1)];
}

function stepReached(current: OnboardingStep, target: OnboardingStep): boolean {
  return ONBOARDING_ORDER.indexOf(current) >= ONBOARDING_ORDER.indexOf(target);
}

// ─── Locale-based currency detection ─────────────────────────────────────────

/**
 * Best-effort default base currency from the browser locale.
 * Used as the initial selection when the user has not yet picked one.
 * Falls back to EUR if Intl can't resolve a region.
 */
function detectLocaleCurrency(): string {
  try {
    const locale = new Intl.Locale(navigator.language);
    // Newer browsers expose `getCurrencies()` on Intl.Locale.
    const withCurrencies = locale as Intl.Locale & { getCurrencies?: () => string[] };
    const currencies = withCurrencies.getCurrencies?.();
    if (currencies && currencies.length > 0) return currencies[0];
  } catch {
    // ignore
  }
  return "EUR";
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface SettingsClientProps {
  initialTimezone: string | null;
  initialBaseCurrency: string | null;
  initialBackups: BackupInfo[];
}

export function SettingsClient({
  initialTimezone,
  initialBaseCurrency,
  initialBackups,
}: SettingsClientProps): React.ReactElement {
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timezone, setTimezone] = useState(initialTimezone ?? detectedTz);
  const [savingTz, setSavingTz] = useState(false);

  const [baseCurrency, setBaseCurrency] = useState<string>(
    initialBaseCurrency ?? detectLocaleCurrency()
  );
  const [savingCurrency, setSavingCurrency] = useState(false);
  // Locked once persisted (whether from initial load or just saved this session).
  // Drives the picker disabled state, hides the Save button, and gates the
  // cash/savings/investments/providers/backups sections below.
  const [baseCurrencyLocked, setBaseCurrencyLocked] = useState(initialBaseCurrency !== null);

  // First setup if either timezone or base currency is missing.
  const isFirstSetup = initialTimezone === null || initialBaseCurrency === null;

  // Determine the starting onboarding step based on what's already configured.
  const initialStep: OnboardingStep = !isFirstSetup
    ? "done"
    : initialBaseCurrency === null
      ? "base-currency"
      : "cash";

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(initialStep);
  const [timezoneSaved, setTimezoneSaved] = useState(initialTimezone !== null);

  const allRevealed = onboardingStep === "done";
  const lastRevealedRef = useRef<HTMLDivElement>(null);

  const scrollToRevealed = useCallback(() => {
    if (lastRevealedRef.current) {
      lastRevealedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (isFirstSetup && !allRevealed) {
      scrollToRevealed();
    }
  }, [onboardingStep, timezoneSaved, isFirstSetup, allRevealed, scrollToRevealed]);

  async function handleSaveTimezone(): Promise<void> {
    setSavingTz(true);
    try {
      const res = await fetch("/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
      if (!res.ok) throw new Error("Failed to save");
      if (isFirstSetup) {
        setTimezoneSaved(true);
      } else {
        window.location.reload();
      }
    } finally {
      setSavingTz(false);
    }
  }

  async function handleSaveBaseCurrency(): Promise<void> {
    setSavingCurrency(true);
    try {
      const res = await fetch("/api/settings/base-currency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: baseCurrency }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const errMsg =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : "Failed to save base currency";
        throw new Error(errMsg);
      }
      // Sync the client format cache so any subsequent formatCurrency() calls
      // pick up the new base currency. The server cache is refreshed on the
      // next request via the root layout. No reload needed: this only happens
      // during first-time onboarding, so there's no rendered data to refresh.
      setBaseCurrencyCache(baseCurrency);
      setBaseCurrencyLocked(true);
      setOnboardingStep(nextStep("base-currency"));
    } finally {
      setSavingCurrency(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        {isFirstSetup && (
          <p className="text-muted-foreground mt-1">
            Welcome to Kinti! Configure your timezone and base currency to get started.
          </p>
        )}
      </div>

      <Section title="Timezone" icon={null}>
        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <TimezonePicker value={timezone} onChange={setTimezone} />
            <p className="text-muted-foreground text-xs">
              Determines what &quot;today&quot; and &quot;this month&quot; mean throughout the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => void handleSaveTimezone()} disabled={savingTz}>
              {savingTz ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Section>

      {timezoneSaved && stepReached(onboardingStep, "base-currency") && (
        <div ref={onboardingStep === "base-currency" ? lastRevealedRef : undefined}>
          <Section title="Base currency" icon={null}>
            <div className="max-w-md space-y-4">
              <div className="space-y-2">
                <CurrencyPicker
                  id="base-currency"
                  value={baseCurrency}
                  onChange={setBaseCurrency}
                  disabled={baseCurrencyLocked}
                />
                <p className="text-muted-foreground text-xs">
                  All report totals, budgets, cash balance, and net worth roll up into this
                  currency.{" "}
                  {baseCurrencyLocked ? "" : "Choose carefully — this can't be changed later."}
                </p>
              </div>
              {!baseCurrencyLocked && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => void handleSaveBaseCurrency()}
                    disabled={savingCurrency || !baseCurrency}
                  >
                    {savingCurrency ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      {baseCurrencyLocked && (
        <>
          {stepReached(onboardingStep, "cash") && (
            <div ref={onboardingStep === "cash" ? lastRevealedRef : undefined}>
              <CashBalanceSection
                isOnboarding={onboardingStep === "cash"}
                onContinue={() => setOnboardingStep(nextStep("cash"))}
              />
            </div>
          )}

          {stepReached(onboardingStep, "savings") && (
            <div ref={onboardingStep === "savings" ? lastRevealedRef : undefined}>
              <SavingsSection
                isOnboarding={onboardingStep === "savings"}
                onContinue={() => setOnboardingStep(nextStep("savings"))}
              />
            </div>
          )}

          {stepReached(onboardingStep, "investments") && (
            <div ref={onboardingStep === "investments" ? lastRevealedRef : undefined}>
              <InvestmentsSection
                isOnboarding={onboardingStep === "investments"}
                onContinue={() => setOnboardingStep(nextStep("investments"))}
              />
            </div>
          )}

          {stepReached(onboardingStep, "providers") && (
            <div ref={onboardingStep === "providers" ? lastRevealedRef : undefined}>
              <ProvidersSection
                isOnboarding={onboardingStep === "providers"}
                onContentLoaded={onboardingStep === "providers" ? scrollToRevealed : undefined}
                onContinue={() => setOnboardingStep(nextStep("providers"))}
              />
            </div>
          )}

          {stepReached(onboardingStep, "backups") && (
            <div ref={onboardingStep === "backups" ? lastRevealedRef : undefined}>
              <BackupManager
                initialBackups={initialBackups}
                isOnboarding={onboardingStep === "backups"}
                onContinue={() => {
                  setOnboardingStep("done");
                  window.location.href = "/";
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
