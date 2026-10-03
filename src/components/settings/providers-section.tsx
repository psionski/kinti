"use client";

import { useState, useEffect, useEffectEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProviderStatusResponse } from "@/lib/validators/financial";
import { PROVIDER_LABELS } from "@/lib/providers/labels";
import { providerListQuery, useSetProviderKey } from "@/lib/queries/providers";
import { Section } from "./settings-section";

interface ProvidersSectionProps {
  isOnboarding: boolean;
  onContinue: () => void;
  /** Called once the provider list has loaded and the section has its full height. */
  onContentLoaded?: () => void;
}

export function ProvidersSection({
  isOnboarding,
  onContinue,
  onContentLoaded,
}: ProvidersSectionProps): React.ReactElement {
  const providers = useQuery(providerListQuery());
  const loaded = providers.data !== undefined;

  // The list arrives after the section is revealed, so the section reports
  // when it has reached its full height.
  const contentLoaded = useEffectEvent(() => onContentLoaded?.());
  useEffect(() => {
    if (loaded) contentLoaded();
  }, [loaded]);

  return (
    <Section
      title="Market Data Providers"
      description="Free providers (Frankfurter, CoinGecko) work without keys. Add API keys for premium providers or higher rate limits."
      icon={<Key className="text-muted-foreground size-5" />}
    >
      <div className="max-w-md space-y-3">
        {providers.data ? (
          providers.data
            .filter((p) => p.apiKeyRequired !== "none")
            .map((p) => <ProviderKeyField key={p.name} provider={p} />)
        ) : providers.isError ? (
          <p className="text-destructive text-sm">
            Couldn&apos;t load providers: {providers.error.message}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Loading providers...</p>
        )}
        <p className="text-muted-foreground text-xs">
          Alpha Vantage provides stock/ETF prices &mdash; get a free key at{" "}
          <a
            href="https://www.alphavantage.co/support/#api-key"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            alphavantage.co
          </a>{" "}
          (25 requests/day).
        </p>
        {isOnboarding && (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onContinue}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

function ProviderKeyField({ provider }: { provider: ProviderStatusResponse }): React.ReactElement {
  const [apiKey, setApiKey] = useState("");
  const saveKey = useSetProviderKey();
  // A saved key shows as set even when the provider list's refetch fails.
  const isSaved = provider.apiKeySet || saveKey.isSuccess;

  return (
    <div className="space-y-1.5">
      <Label className="capitalize">{PROVIDER_LABELS[provider.name]}</Label>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={isSaved ? "Key already set" : "API key"}
          value={apiKey}
          disabled={isSaved}
          onChange={(e) => setApiKey(e.target.value)}
        />
        {!isSaved && (
          <Button
            variant="outline"
            size="sm"
            disabled={!apiKey || saveKey.isPending}
            onClick={() => saveKey.mutate({ provider: provider.name, key: apiKey })}
          >
            {saveKey.isPending ? "Saving..." : "Save"}
          </Button>
        )}
        {isSaved && (
          <div className="flex items-center px-2">
            <Check className="text-primary size-4" />
          </div>
        )}
      </div>
      {saveKey.error && <p className="text-destructive text-sm">{saveKey.error.message}</p>}
    </div>
  );
}
