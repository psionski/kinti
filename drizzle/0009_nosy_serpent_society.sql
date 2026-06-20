-- Multi-currency: lots now snapshot the per-unit price in the configured base
-- currency at lot creation. Reads (cost basis, current value, FX-vs-price P&L
-- decomposition) sum/multiply this column directly instead of converting on
-- read. Locked at lot creation, so historical reports stay stable even as
-- provider rates drift.
--
-- Backfill assumption: existing lots are denominated in their asset's currency
-- which equals the configured base currency (single-currency installs). The
-- backfill copies `price_per_unit` verbatim — correct for any user who never
-- configured a non-base asset before this migration. Multi-currency installs
-- created before this migration didn't exist; this is the first multi-currency
-- migration that touches asset_lots.
ALTER TABLE `asset_lots` ADD `price_per_unit_base` real DEFAULT 0 NOT NULL;--> statement-breakpoint

UPDATE `asset_lots` SET `price_per_unit_base` = `price_per_unit`;