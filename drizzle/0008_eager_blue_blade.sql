-- Multi-currency: each transaction now stores its native currency plus a
-- denormalized base-currency amount, so report aggregations are O(N) sums
-- with no FX joins. Kinti instances are base-currency-immutable per DB.
--
-- Backfill assumption: existing rows are EUR-only. The currency column is
-- backfilled from the configured base_currency setting (falling back to
-- 'EUR' for old databases that haven't gone through onboarding yet) and
-- amount_base is set equal to amount, on the assumption that historic data
-- was already in the configured base currency. Users who logged non-base-
-- currency cash flows against multi-currency assets pre-migration should
-- review and correct those rows manually.

ALTER TABLE `recurring_transactions` ADD `currency` text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `amount_base` real DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Backfill currency from the configured base_currency (or keep 'EUR' default).
UPDATE `transactions`
SET `currency` = COALESCE(
  (SELECT `value` FROM `settings` WHERE `key` = 'base_currency'),
  'EUR'
);--> statement-breakpoint

UPDATE `recurring_transactions`
SET `currency` = COALESCE(
  (SELECT `value` FROM `settings` WHERE `key` = 'base_currency'),
  'EUR'
);--> statement-breakpoint

-- Backfill amount_base from amount (single-currency assumption for legacy data).
UPDATE `transactions` SET `amount_base` = `amount`;