export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { getSettingsService } from "@/lib/api/services";
import { listBackups } from "@/lib/services/backup";
import { SettingsClient } from "@/components/settings/settings-client";
import { seedQueries } from "@/lib/queries/seed";
import { backupListQuery } from "@/lib/queries/backups";

export default function SettingsPage(): React.ReactElement {
  const settings = getSettingsService();

  const state = seedQueries((client) => {
    client.setQueryData(backupListQuery().queryKey, listBackups());
  });

  return (
    <HydrationBoundary state={state}>
      <SettingsClient
        initialTimezone={settings.getTimezone()}
        initialBaseCurrency={settings.getBaseCurrency()}
      />
    </HydrationBoundary>
  );
}
