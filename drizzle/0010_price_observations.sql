-- Trade fills no longer masquerade as user price marks.
--
-- `AssetLotService` used to mirror every buy/sell/opening-lot price into
-- `asset_prices` — the same table that backs the user's "Set Price" override.
-- The resolver gave that table unconditional priority over provider data, so a
-- fill from weeks ago outranked today's quote permanently and the portfolio
-- stayed marked at the price the user happened to trade at. The write is gone;
-- this clears the rows it already produced.
--
-- Match rule: an `asset_prices` row is machine-written when it is recorded at
-- an exact local midnight AND the same asset has a lot at the same
-- `price_per_unit` on the day it was recorded or the day after.
--
-- The midnight test comes first because it is what makes the date window sound.
-- `recordPriceSnapshot` stored `localToUtc(lotDate + "T00:00:00")`, and every
-- UTC offset is a whole number of minutes, so a snapshot's seconds and
-- sub-seconds are always zero. `AssetPriceService.record()` stamps a mark taken
-- "now" with `Temporal.Now.instant()`, which effectively never is.
--
-- That matters because UTC-vs-local shifts run in *both* directions in general:
-- a mark typed at 21:00 in New York is stored as 01:00Z the following day, so
-- `date(recorded_at)` can be a day *later* than the local day it belongs to.
-- Restricted to midnight-shaped rows the ambiguity collapses — local midnight
-- of day D converts to D−1 late in the day at eastern offsets (UTC+3 → D−1
-- 21:00Z, UTC+5:45 → D−1 18:15Z) and stays on D at UTC and western ones (max
-- UTC−12 → D 12:00Z). So for every row this DELETE can touch,
-- `date(recorded_at)` is D or D−1 and never later, in any timezone. Hence the
-- one-sided window; a symmetric ±1 day would buy nothing and would additionally
-- admit a mark recorded the day *after* a same-priced lot.
--
-- What remains is a mark the user backdated through the dialog, which writes
-- `date + "T00:00:00"` and so shares the snapshot's shape exactly. Those are
-- bounded by the price match alone: caught only if the backdated price repeats
-- a lot's price to the last decimal within the window. Such a row is not always
-- redundant — with a quote cached at a different price, dropping the mark lets
-- the quote win — so this is a real if narrow trade-off, not just tidying.
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
   AND l.`date` BETWEEN date(p.`recorded_at`) AND date(p.`recorded_at`, '+1 day')
  WHERE strftime('%f', p.`recorded_at`) = '00.000'
);
