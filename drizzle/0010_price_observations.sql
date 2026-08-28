-- Trade fills no longer masquerade as user price marks.
--
-- `AssetLotService` used to mirror every buy/sell/opening-lot price into
-- `asset_prices` — the same table that backs the user's "Set Price" override.
-- The resolver gave that table unconditional priority over provider data, so a
-- fill from weeks ago outranked today's quote permanently and the portfolio
-- stayed marked at the price the user happened to trade at. The write is gone;
-- this clears the rows it already produced.
--
-- Match rule: an `asset_prices` row is machine-written when the same asset has
-- a lot at the same `price_per_unit` within a day of it. `recordPriceSnapshot`
-- was always handed its lot's own price and date, so every such row satisfies
-- this; the ±1 day tolerance absorbs the local-day/UTC-instant offset without
-- needing to know the install's timezone.
--
-- Collateral risk is bounded by the exact price match: a hand-entered mark is
-- only caught if it repeats a nearby lot's price to the last decimal, and
-- deleting such a row cannot change what the resolver returns for that day —
-- `findLotPrice` yields the identical number from the lot it matched.
--
-- This is hygiene, not a load-bearing fix: the new resolver ranks observations
-- by date, so these rows would already lose to fresher market data. Removing
-- them keeps `asset_prices` meaning only what its name says.
DELETE FROM `asset_prices`
WHERE `id` IN (
  SELECT p.`id`
  FROM `asset_prices` p
  JOIN `asset_lots` l
    ON l.`asset_id` = p.`asset_id`
   AND l.`price_per_unit` = p.`price_per_unit`
   AND l.`date` BETWEEN date(p.`recorded_at`, '-1 day') AND date(p.`recorded_at`, '+1 day')
);
