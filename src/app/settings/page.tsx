export const dynamic = "force-dynamic";

import { getSettingsService } from "@/lib/api/services";
import { listBackups } from "@/lib/services/backup";
import { SettingsClient } from "@/components/settings/settings-client";

export default function SettingsPage(): React.ReactElement {
  const settings = getSettingsService();
  const timezone = settings.getTimezone();
  const baseCurrency = settings.getBaseCurrency();
  const backups = listBackups();

  return (
    <SettingsClient
      initialTimezone={timezone}
      initialBaseCurrency={baseCurrency}
      initialBackups={backups}
    />
  );
}
