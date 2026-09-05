# ARCHITECTURE.md — Kinti Architecture & Coding Standards

This is the comprehensive reference for working on Kinti's codebase: system design, conventions, and the coding standards every change must follow. Read it before any coding task. For current work status and the sprint roadmap, see `plan.md`.

---

## Project Overview

Kinti is an AI-powered personal finance tracker. Single-user (for now), self-hosted, SQLite-backed. It pairs a **Next.js 16 web dashboard** (viewing and analyzing spending) with an **embedded MCP server** for AI interaction: receipt scanning, categorization, batch operations, ad-hoc SQL queries. Multi-currency: each Kinti instance has an immutable base currency (set at onboarding) into which all reports, budgets, and net worth roll up. Transactions can be in any ISO 4217 currency and are converted to the base at write time using configured FX providers.

### Actors

| Actor | What it is | How it interacts with Kinti |
|-------|-----------|----------------------------|
| **User** | The human (app owner). | Browses the web UI from any device. Sends receipts/commands to the AI assistant via Telegram. |
| **AI** | An AI assistant (e.g. built on [OpenClaw](https://github.com/openclaw/openclaw)). May run on the same host or a different machine. | Connects to Kinti's MCP endpoint over HTTP. Uses MCP tools for structured operations (transactions, categories, reports, budgets). Uses companion REST endpoint for binary uploads (receipt images). Discovery: MCP server `instructions` field tells clients about the REST upload endpoint. |

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) | Full-stack: React frontend + API routes + MCP endpoint |
| Language | TypeScript (strict) | End-to-end type safety |
| Styling | Tailwind CSS 4 | Utility-first, fast iteration |
| UI Components | shadcn/ui | Accessible, composable, Tailwind-native |
| Optimization | React Compiler | Auto-memoization; enabled via `reactCompiler: true` in `next.config.mjs` |
| Charts | Recharts (via shadcn/ui) | Chart primitives built on Recharts + Tailwind |
| Database | SQLite (via better-sqlite3) | Single file, zero infra, perfect for personal use |
| ORM | Drizzle ORM | Type-safe, SQL-like query builder, great SQLite support |
| Migrations | Drizzle Kit | Schema-driven, generates SQL migrations |
| Validation | Zod | Shared schemas for API, MCP tools, and forms |
| MCP | @modelcontextprotocol/sdk | Streamable HTTP transport, mounted inside Next.js (stateless mode) |
| Scheduling | node-cron | In-process cron via Next.js instrumentation hook |
| Dates | @js-temporal/polyfill | TC39 Temporal — all date/time math (no legacy `Date`) |

---

## System Architecture

```
        Browser                          AI Assistant
           │                                  │
┌──────────┼──────────────────────────────────┼───────┐
│          ▼            Next.js App           ▼       │
│                                                     │
│  ┌───────────────┐                    ┌───────────┐ │
│  │   React UI    │                    │    MCP    │ │
│  │ Server│Client │                    │ /api/mcp  │ │
│  └──┬────┘──┬────┘                    └─────┬─────┘ │
│     │       │                               │       │
│     │  ┌────▼────────┐                      │       │
│     │  │  API Routes │                      │       │
│     │  │  /api/*     │                      │       │
│     │  └────┬────────┘                      │       │
│     │       │                               │       │
│     ▼       ▼                               ▼       │
│  ┌──────────────────────────────────────────────┐   │
│  │            Service Layer (shared)            │   │
│  │  Transactions, Categories, Reports, Budgets, │   │
│  │  Recurring, Receipts, Assets, Portfolio,     │   │
│  │  FinancialData, Settings                     │   │
│  └────────────────────┬─────────────────────────┘   │
│                       ▼                             │
│  ┌──────────────────────────────────────────────┐   │
│  │           Drizzle ORM + SQLite               │   │
│  │           (better-sqlite3)                   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Three entry points to the service layer:**
- **Server Components** call services directly during SSR (initial page data)
- **Client Components** call API routes (`/api/*`), which call services
- **AI assistants** call the MCP endpoint (`/api/mcp`), which calls services

No logic duplication — all paths converge on the same services → same DB.

### Access & Security

**Phase 1: Tailscale-only access.** No auth layer in the app initially.

- App binds to `0.0.0.0:<port>` but is only reachable via Tailscale network
- Works on all devices: desktop browser, iOS (Tailscale app), Android
- Optional safety net: middleware that verifies requests come from the Tailscale interface (`100.x.x.x` source IP)
- MCP endpoint is localhost-only — the AI assistant runs on the same host

**Why Tailscale-first:** Single user, personal VPS. Tailscale gives us mutual WireGuard authentication at the network level — good enough to start without building login flows.

**Future: app-level auth.** Keep auth concerns isolated (middleware/route guards), so we can slot in session-based or token-based auth when needed. **Note:** Once auth is added and pages call `cookies()`/`headers()`, Next.js will automatically treat them as dynamic — at that point, remove the `export const dynamic = "force-dynamic"` lines from page files.

### Project Structure

```
src/
├── instrumentation.ts           # Next.js hook — starts cron jobs on server boot
├── app/                         # Pages: /, /transactions, /categories, /reports
│   │                            #   (cash-flow + portfolio), /budgets, /recurring,
│   │                            #   /assets, /settings, /api-docs
│   └── api/                     # REST routes per domain + /api/mcp (MCP endpoint)
│       └── mcp/route.ts         #   + /api/openapi (spec endpoint)
├── components/                  # Per-domain dirs (budgets/, categories/, assets/,
│   │                            #   portfolio/, dashboard/, …)
│   └── ui/                      #   + shadcn/ui primitives
├── lib/
│   ├── api/                     # Route helpers, service factories, OpenAPI spec
│   ├── db/                      # Drizzle schema, connection singleton, seed
│   ├── services/                # One service per domain — single source of truth
│   ├── providers/               # Financial data providers (ECB, Frankfurter,
│   │                            #   CoinGecko, Alpha Vantage, Open Exchange Rates)
│   ├── mcp/                     # MCP server init + tools/ (one file per domain)
│   ├── validators/              # Zod schemas shared by API, MCP, and forms
│   ├── utils/                   # Currency formatting
│   ├── date-ranges.ts           # All date/time utilities (timezone-aware)
│   └── cron.ts                  # Recurring (02:00) + backup (03:00) + market prices (04:00)
├── test/                        # All tests — not colocated with source
│   ├── helpers.ts               # makeTestDb() shared helper
│   ├── unit/                    # Service + utility tests
│   └── integration/             # API route + MCP protocol tests
│       ├── api/
│       └── mcp/
e2e/                             # E2E tests (Playwright) + MCP test prompts
data/                            # Runtime (gitignored): kinti.db, backups/, receipts/
drizzle/                         # Generated migrations
```

---

## Database Schema

Schema defined in `src/lib/db/schema.ts` (Drizzle ORM). Migrations in `drizzle/`.

### Key design decisions

- **Money as plain decimals** (`real` columns, JS `number`). IEEE 754 doubles give ~15 significant digits — sufficient for any currency or exchange rate. `Math.round(x * 100) / 100` at service boundaries handles sub-cent float noise.
- **Hierarchical categories** via `parent_id` self-reference.
- **Soft-delete on budgets** (`deleted` flag) for inheritance — a deleted budget means "revert to default" for that month, not "no budget."
- **Receipts** group transactions from a single purchase. A receipt can span multiple categories.
- **Recurring templates** define schedule + template fields; generated transactions are normal, independently editable rows linked via `recurring_id`.
- **Settings** as a key-value store (timezone, API keys, preferences).
- **Unified price cache** (`market_prices`): exchange rates stored as prices (e.g., symbol='USD', currency='EUR', price=0.92 means 1 USD = 0.92 EUR).
- **Assets + lots model**: `assets` for metadata, `asset_lots` for buy/sell/deposit/withdrawal events (positive qty = buy, negative = sell), `asset_prices` for prices the **user** recorded by hand ("Set Price") — never trade fills, which live in `asset_lots` and nowhere else.
- **FTS5** virtual table for full-text search on transaction descriptions, merchants, and notes. Kept in sync via triggers (see migrations).

**Price resolution** (in `src/lib/services/price-resolver.ts`): a price is a **dated observation, and the most recent one wins**.

1. Deposit identity — base-currency deposits are always 1.00.
2. The later of {user mark in `asset_prices`, provider quote in `market_prices`}; a same-day tie goes to the user mark, since the user looked at the asset more recently than the provider did.
3. Lot cost basis, only when neither exists.

A fill price is **not** a valuation — it's a fact about a transaction — so it can never outrank a mark or a quote by being newer. That distinction is the whole design: mirroring fills into `asset_prices` (as `AssetLotService` once did) made every buy a permanent manual override, and the portfolio stayed marked at the price the user happened to trade at no matter how much fresh market data arrived.

Ranking by date is what removes the need for staleness thresholds. A fresh quote beats an old mark; a mark entered today beats today's quote; an unlinked asset (a car, a flat) keeps its last mark indefinitely because nothing else ever values it; and a weekend needs no special case, because Friday's close is simply still the most recent observation on Sunday. `ResolvedPrice.asOf` carries the day the price is *for*, which is not necessarily the day that was requested.

Because there are no thresholds, the resolver must not inherit one from the cache layer. `market_prices` has **two** read paths, and they answer different questions:

| Helper | Window | Question |
| --- | --- | --- |
| `findCachedPrice` | 7 days | "What was this worth on day *D*?" — approximates a requested day, so Sunday resolves to Friday's close. Past a week the feed is broken rather than closed, and returning an arbitrarily old row would misstate which day the number belongs to. |
| `findLatestQuote` | unbounded | "What is the latest thing anyone observed?" — used by the resolver, which ranks the result against the other observations itself. |

Routing the resolver through the windowed query is what produced the WEBN regression: with the feed dead for ten days, the last quote fell outside the window, and a **fifteen**-day-old fill price won by default — the asset page showed a €34,415 position marked at exactly what the user paid. Discarding a quote for being stale never makes a fresher one appear; it only hands the question to a worse source. So an old quote is discarded by being *outranked*, never by being old, and `priceSource` + `priceAsOf` are surfaced on `AssetWithMetrics` so the UI can show a fallback as a fallback instead of dressing cost basis up as a live quote.

The other half of that failure was refresh, not resolution: `runMarketPriceJob` made one attempt per asset per day, so a single bad response left an asset mispriced for 24 hours and, eventually, indefinitely.

The observed failure was time-of-day dependent, not quota. At 04:00 local (01:00 UTC) Alpha Vantage returned HTTP 200 with an empty `Global Quote` for two thinly traded XETRA listings — `WEBN.DEX` and `2B76.DEX` — every day for ten days, while `SXR8.DEX` on the same key in the same run succeeded 160/160. The same two symbols answer normally a few hours later. Quota exhaustion looks different in the logs: it arrives as an `Information` envelope, which `assertNoErrorEnvelope` turns into a thrown `ProviderRateLimitError`, so it is recorded with the provider's message rather than as `"no data"`.

`runMarketPriceRetry` therefore re-runs at 10:00/16:00/22:00 for assets that still have no quote dated today, skipping the rest without touching a provider — on a normal day it makes no requests at all, which matters because retries share Alpha Vantage's 25 requests/day with the user's own lookups. It deliberately does not branch on *why* a fetch missed: asking again later is the remedy for an empty early-morning response and for an exhausted budget alike.

**`updated_at` management:** No triggers — services are the single mutation path and set `updated_at` explicitly on every UPDATE.

**SQLite PRAGMAs** (set on every connection in `src/lib/db/index.ts`): WAL mode, foreign keys ON, 64MB cache, 5s busy timeout.

---

## MCP Tools

Tool definitions live in `src/lib/mcp/tools/` — one file per domain (Transactions, Categories, Budgets, Recurring, Receipts, Reporting, Portfolio Reports, Assets, Financial Data, Backups, Onboarding, Settings, Sample Data, Escape Hatch), plus `get_started` in `src/lib/mcp/register.ts`. Those files are the authoritative list of tools and their schemas — consult them rather than maintaining a copy here. The `get_started` tool returns onboarding instructions and conventions; AI clients should call it first. The Escape Hatch domain exposes `get_db_schema` and `query` (read-only SQL) for ad-hoc analysis.

### MCP Integration Details

The MCP server runs inside Next.js as a **stateless** Streamable HTTP endpoint at `/api/mcp` (see `src/app/api/mcp/route.ts`).

**Key decisions:**
- **Stateless mode:** `sessionIdGenerator: undefined` — no session headers, no SSE resumption. Each POST creates a fresh server, handles the request, tears down. Fits Next.js route handlers perfectly.
- **JSON responses:** `enableJsonResponse: true` — plain JSON, no streaming needed for tool calls.
- **Server instructions:** The `McpServer` `instructions` field advertises the companion REST endpoint for receipt uploads. This is how AI clients discover that binary uploads go through REST, not MCP.

---

## Scheduled Tasks & Recurring Transaction Engine

Three cron jobs run in-process via `node-cron`, started from `src/instrumentation.ts` → `src/lib/cron.ts`:

| Time | Job | Details |
|------|-----|---------|
| 02:00 | Recurring transaction generation | Creates pending transactions from active templates up to today |
| 03:00 | SQLite backup | `.backup` to `data/backups/`, keeps last 7 daily |
| 04:00 | Market price auto-fetch | For each asset with a `symbolMap`, fetches today's price from the linked provider. Every asset it can't price is logged with its symbols and a reason — a silent refresh failure is indistinguishable on screen from a price that didn't move |

**Why in-process cron:** Kinti is self-hosted (long-lived Node.js process, not serverless). `instrumentation.ts` runs exactly once on server start — perfect for scheduling. A `globalThis` singleton guard prevents duplicate jobs from dev-mode hot-reload.

**Recurring engine behavior:**
1. Templates define amount, description, category, frequency, schedule details, start/end date
2. Engine tracks `last_generated` per template
3. Runs daily via cron + on first request after startup via middleware + manually via `generate_pending_recurring` MCP tool
4. Generated transactions are normal rows linked via `recurring_id` — independently editable/deletable
5. Deactivating a template stops future generation but doesn't touch existing transactions

---

## Web UI Pages

Components live in `src/components/{domain}/`; see the README and the pages themselves for the current widget breakdown.

- **Dashboard (`/`)** — KPI cards, spending trend, category breakdown, recent transactions, budget alerts, upcoming recurring, net worth + portfolio snapshot.
- **Transactions (`/transactions`)** — sortable list, filter bar, inline edit, bulk select.
- **Categories (`/categories`)** — hierarchical tree with per-category spend/budget, CRUD, merge.
- **Budgets (`/budgets`)** — monthly budgets per category, progress bars, copy-from-previous-month, adherence history.
- **Recurring (`/recurring`)** — template list + create/edit form, active toggle, generated-transaction view.
- **Assets (`/assets`, `/assets/[id]`)** — summary cards, performance table, allocation/exposure charts; detail page with value/lot/price history.
- **Cash Flow (`/reports/cash-flow`)** — spending by category, trends, merchants, budget vs actual, income vs expenses. (`/reports` redirects here.)
- **Portfolio (`/reports/portfolio`)** — net worth over time, allocation, performance ranking, realized vs unrealized P&L, transfer flow.
- **Settings (`/settings`)** — timezone selector (onboarding gate) + provider API-key management.

*Sidebar groups: **Track** (Transactions, Assets, Recurring), **Plan** (Categories, Budgets), **Reports** (Cash Flow, Portfolio).*

---

## Receipt Flow

Receipt images are binary — MCP tools accept only JSON. So uploads go through a **companion REST endpoint**:

1. `POST /api/receipts/upload` — multipart/form-data. Saves image to `data/receipts/YYYY-MM/`, creates DB row, returns `{ receipt_id }`.
2. MCP `create_transactions` accepts `receipt_id` to link line items.
3. `GET /api/receipts/[id]/image` — streams the image with correct `Content-Type`.

**AI workflow:** User sends receipt photo → AI extracts items via vision → uploads image via REST → calls `create_transactions` with line items + `receipt_id`. Each item categorized independently.

**Discovery:** AI clients learn about the REST endpoint via MCP server `instructions` field.

---

## API Conventions

### Error response contract

All API routes and MCP tools return a consistent error shape with `error` (message), `code` (`VALIDATION_ERROR | NOT_FOUND | CONFLICT | INTERNAL_ERROR`), and optional `details`. See `src/lib/api/helpers.ts` for the `errorResponse` helper.

### Pagination contract

All list endpoints: `limit` (default 50, max 200) + `offset` (default 0). Response envelope: `{ data, total, limit, offset, hasMore }`. Shared Zod schema in `src/lib/validators/common.ts`.

### Tags

Stored as JSON text arrays on transactions and recurring templates. Filter via `json_each()` in SQLite (OR logic). Dedicated `list_tags` tool for autocomplete. No separate tags table — intentionally simple.

---

## Data Storage

- **Database:** `data/kinti.db` (SQLite, gitignored)
- **Receipt images:** `data/receipts/YYYY-MM/receipt-{id}.{ext}` (gitignored)
- **Backups:** `data/backups/kinti-YYYY-MM-DD.db` (daily, last 7 kept)

---

## Documentation Lookup

**Always use Context7 MCP to look up library documentation before writing code that depends on a library** (Next.js, Drizzle, shadcn/ui, Recharts, Zod, MCP SDK, Tailwind, etc.) — don't rely on potentially outdated training data. Workflow: `resolve-library-id` → `query-docs` → write code against the actual current API.

---

## Code Quality Standards

### TypeScript

- Strict mode is non-negotiable. No `any` types — use `unknown` and narrow, or define proper types.
- Prefer `interface` for object shapes, `type` for unions/intersections/utilities.
- All function signatures must have explicit return types for exported/public functions.
- Use Zod schemas as the single source of truth for validation, then infer TypeScript types from them (`z.infer<typeof schema>`).

### Architecture

- **Service layer is the single source of truth for business logic.** API routes and MCP tools are thin wrappers that validate input (Zod), call services, and format output. No business logic in routes or tool handlers.
- **No logic duplication.** If both an API route and an MCP tool need the same operation, it lives in the service layer.
- Keep modules focused and small. One service per domain (transactions, categories, reports, budgets, recurring).
- **Service instances:** Use factory functions from `src/lib/api/services.ts` (e.g. `getBudgetService()`). Don't construct services directly outside tests.
- Shared validators in `src/lib/validators/` — used by API routes, MCP tools, and frontend forms.
- **API route helpers:** Use `parseBody`, `parseSearchParams`, `isErrorResponse`, `errorResponse` from `src/lib/api/helpers.ts`. Don't write manual JSON parsing or error responses in routes.

### Date/Time Conventions

The app has a single **user-configured timezone** stored in the `settings` table (key `"timezone"`, IANA identifier like `"Europe/Amsterdam"`). This timezone is the source of truth for what "today" and "this month" mean.

**Storage:**
- Calendar dates are stored as `YYYY-MM-DD` strings — civil dates, not UTC dates.
- Timestamps (`createdAt`, `updatedAt`, `recordedAt`) are stored as ISO 8601 UTC (e.g. `2026-03-21T14:30:00.000Z`). SQLite `datetime('now')` defaults produce UTC.

**Boundaries — convert at the edges:**
- **Input:** When computing "today" or "current month", use `isoToday()` / `getCurrentMonth()` from `src/lib/date-ranges.ts` — these use the app timezone internally. When accepting timestamps from API/MCP input, use `localToUtc()` to convert to UTC before storage.
- **Output:** Calendar dates (`YYYY-MM-DD`) are already civil dates and need no conversion. Timestamps are converted from UTC to local time via `utcToLocal()` in service parse functions, so all API/MCP consumers receive timestamps in the user's timezone.

**Temporal API** — all date/time code uses `@js-temporal/polyfill` (TC39 Stage 4 polyfill). Do **not** use the legacy `Date` object for date math, formatting, or timezone conversion. Use the appropriate Temporal type:
- `Temporal.PlainDate` — calendar dates (`YYYY-MM-DD`): parsing, arithmetic, comparisons, formatting.
- `Temporal.PlainYearMonth` — month-level operations: `daysInMonth`, month arithmetic, formatting.
- `Temporal.Instant` — exact moments in time (UTC): timestamp conversion, epoch math.
- `Temporal.ZonedDateTime` — intermediate type for UTC↔local conversion (via `toZonedDateTimeISO(tz)` / `toZonedDateTime(tz)`).
- `Temporal.Now` — current time: `Temporal.Now.plainDateISO(tz)` for today's date, `Temporal.Now.instant()` for current UTC instant.
- Legacy `Date` is acceptable only for epoch-millisecond arithmetic (e.g. cache TTL via `Date.now()`) where Temporal adds no value.

**Date utilities** (`src/lib/date-ranges.ts`):
- `utcToLocal()`, `localToUtc()` — timestamp conversion between UTC storage and user's timezone.
- `isoToday()`, `getCurrentMonth()`, `getCurrentMonthInfo()`, `computePresetRange()`, `windowToDateRange()` — all timezone-aware via cached setting.
- `offsetDate()`, `daysBetween()`, `generateDatePoints()`, `computeCompareRange()` — pure date math on `YYYY-MM-DD` strings, timezone-agnostic.
- `clearTimezoneCache()` — call after changing the timezone setting.
- Don't create local date helpers in other files. Use these shared utilities.

**Settings infrastructure:**
- `SettingsService.getTimezone()` returns `string | null` (`null` = not configured).
- `SettingsService.setTimezone(tz)` validates the IANA identifier and stores it.
- MCP tools: `get_timezone`, `set_timezone`.
- API: `GET/PUT /api/settings/timezone`.
- Onboarding gate: each page calls `requireOnboarding()` from `src/lib/api/require-timezone.ts` — redirects to `/settings` if timezone OR base currency is not configured. Server startup initializes both via `instrumentation.ts`.

### Currency Conventions

Kinti is **multi-currency**. Each Kinti instance has a single **base currency** stored in the `settings` table (key `"base_currency"`, ISO 4217 like `"EUR"` or `"USD"`, default EUR). It is set once during onboarding and **immutable** thereafter — migrating between base currencies requires a fresh database. The base currency is the unit that every aggregate report, budget, cash balance, and net-worth figure is denominated in.

**Storage on `transactions`:**
- `amount` — native amount in the transaction's own currency (signed for transfers).
- `currency` — ISO 4217 code of the native amount.
- `amount_base` — the same value converted to the base currency at write time (denormalized so reports never need FX joins).

The same `currency` column lives on `recurring_transactions`. Generated transactions inherit it and have `amount_base` recomputed using the FX rate on the generation date.

**Boundaries — convert at the edges:**
- **Write time:** `TransactionService.create/update/createBatch/updateBatch` and `AssetLotService.buy/sell` are async and consult `FinancialDataService.convertToBase()` to compute `amount_base`. The write fails if no provider can resolve the rate.
- **Read time:** Aggregations sum `amount_base` directly. Per-row display uses `formatCurrency(tx.amount, tx.currency)` for the native value, with `formatCurrency(tx.amountBase)` shown in a tooltip when the row is in a foreign currency.
- **Format:** Never hardcode a currency symbol or `Math.round(x * 100) / 100` — Intl handles per-currency precision (JPY has 0 decimals, BHD has 3). Three formatters live in `src/lib/format.ts`; each omits its `currency` argument to default to the cached base currency:

| Function | Use for | Example output |
| --- | --- | --- |
| `formatCurrency(amount, currency?)` | Amounts of money — totals, balances, cost basis, P&L. Uses the currency's own precision. | `628,00 €` |
| `formatCurrencyCompact(amount, currency?)` | Money on a chart axis, where ticks are approximate. | `100.000 €` |
| `formatUnitPrice(price, currency?)` | The price of one unit — quotes, manual marks, lot fills. Same presentation, variable precision. | `12,94 €`, `0,00000514 €` |
| `formatQuantity(value)` | A holdings or lot count. Exact below a million, abbreviated above it. | `2.695`, `0,01305`, `5 Mrd.` |
| `formatAxisTick(value)` | A unit price on a chart axis. No symbol — the gutter has no room. | `89.000`, `0,0000001` |
| `priceInputValue(price)` | The `value` of a number `<input>`. Never render it as text. | `89000.00` |

`formatQuantity` abbreviates only above a million on purpose: compact notation rounds to a few significant digits, and in a `.`-grouping locale 12345 renders as `12.350`, which reads as a precise 12,350 — a different number of units. Past a million the `Mio.`/`Mrd.` suffix makes the rounding explicit. `formatAxisTick` accepts that rounding because axis ticks are approximations by design.

`formatUnitPrice` and `priceInputValue` are not interchangeable. A unit price can be finer than its currency's scale, so `formatCurrency` renders a `0,00000514 €` coin as `0,00 €`. Going the other way is worse: `parseFloat("89.000,00 €")` is `89`, because `parseFloat` stops at the first `.` and reads it as the decimal point — a display string in a number input silently books a value off by 1000×, and the input rejects it as non-numeric besides.

**Settings infrastructure:**
- `SettingsService.getBaseCurrency()` returns `string | null` (`null` = not configured).
- `SettingsService.setBaseCurrency(code)` throws if a different value is already set (immutability).
- `getBaseCurrency()` / `setBaseCurrencyCache()` from `src/lib/format.ts` are the synchronous globalThis cache used by services (initialised by `instrumentation.ts` and `BaseCurrencyInit`).
- Validators: `CurrencySchema` in `src/lib/validators/common.ts` (ISO 4217, validated against `Intl.supportedValuesOf`).
- MCP tools: `get_base_currency`, `set_base_currency`.
- API: `GET/PUT /api/settings/base-currency`.

**Foreign-exchange providers:**
- The default FX chain (when no asset is involved) is `frankfurter` → `fawazahmed` (CC0 jsDelivr CDN, no key, covers 200+ currencies).
- `FinancialDataService.convertToBase(amount, from, date)` is the canonical helper.
- The 04:00 cron also calls `backfillTransactionRates()` to populate any `(date, currency)` pair that has a transaction but no cached FX rate.

### Database

- All schema changes go through Drizzle Kit migrations. Never modify the DB manually.
- Set SQLite PRAGMAs on every connection (WAL mode, foreign keys ON, etc. — see Database Schema above).
- Use Drizzle's query builder for type-safe queries. Raw SQL only for the `query` escape hatch MCP tool (read-only).

### Error Handling

- Validate at system boundaries (API input, MCP tool input, user-submitted forms). Trust internal code.
- Return structured error responses from API routes (consistent shape with `error` field).
- Don't over-catch. Let unexpected errors propagate to the framework's error handler.

### Components & UI

- Use shadcn/ui components as the base. Don't reinvent accessible primitives.
- Recharts (via shadcn/ui chart primitives) for charts and dashboard widgets.
- Components should be composable and focused. No god-components.
- Server Components by default; only use `"use client"` when you need interactivity or browser APIs.
- **Page pattern:** Server component fetches initial data via service layer, passes to a `"use client"` wrapper (e.g. `BudgetsClient`) as `initialData` props. Client component owns state, mutations, and dialogs.
- **Domain components** go in `src/components/{domain}/` (e.g. `src/components/budgets/`). Dashboard widgets go in `src/components/dashboard/`.

#### React Compiler — no manual memoization

The **React Compiler is enabled** (`reactCompiler: true` in `next.config.mjs`), so it auto-memoizes components, derived values, and callbacks at build time. **Do not add `useMemo`, `useCallback`, or `React.memo` for performance.** Write derived values as plain `const`s (extract a module-level helper for multi-statement derivations) and event handlers as plain functions — the compiler handles memoization. The `eslint-plugin-react-hooks` (v7, `recommended-latest`) rule flags any component the compiler can't safely optimize; fix the flagged code rather than reaching for manual memoization.

- **Keep manual memoization only when identity is load-bearing for correctness** — e.g. a value/callback passed to an identity-sensitive third-party hook (`useJoyride` in `interactive-tour.tsx`). Comment *why* when you do.
- **Effects:** prefer inlining a derivation into the effect (so its deps stay primitive) over depending on a component-scoped function. This keeps `exhaustive-deps` clean without `useCallback`.
- **Don't hand-edit vendored `src/components/ui/*` (shadcn) primitives** just to strip their memoization — keep them aligned with upstream.

## Testing

### Folder Structure

All Vitest tests live in `src/test/` — not colocated with source. Never create `__tests__/` directories next to source files. E2E tests (Playwright, MCP prompts) live in the top-level `e2e/` folder.

```
src/test/
├── helpers.ts                    # makeTestDb() — shared DB helper
├── unit/                         # Service + utility tests (Vitest, in-memory DB)
│   └── {domain}.service.test.ts
├── integration/                  # API route + MCP protocol tests (Vitest)
│   ├── api/                      # Route handler tests
│   └── mcp/                      # MCP JSON-RPC protocol tests
e2e/                              # E2E tests (separate from Vitest)
├── mcp/                          # Manual MCP test prompts
├── ui/                           # Playwright browser E2E tests
│   ├── prepare-db.ts             # Kill stale server, clean DB, seed
│   ├── helpers.ts                # Reusable UI action helpers
│   ├── seed-and-tour.spec.ts     # Phase 1: seeded DB — tutorial + sample data clear
│   ├── onboarding.spec.ts        # Phase 2: fresh DB — settings wizard
│   └── *.spec.ts                 # Phase 3: configured DB — CRUD tests
```

### Conventions

- **Naming:** `{domain}.service.test.ts` for service tests, `{domain}.test.ts` for other unit tests, `{domain}.api.test.ts` for API route tests.
- **DB helper:** Use `makeTestDb()` from `src/test/helpers.ts` for in-memory SQLite setup. Never create your own DB setup in tests.
- **Write tests for all service layer logic.** Services are the core of the app — they must be tested.
- **Test with a real SQLite database** (in-memory via `makeTestDb()`), not mocks. The ORM and DB behavior are part of what we're validating.
- Use Vitest as the test runner. Service tests use `// @vitest-environment node` at the top.
- Test the contract: given these inputs, expect these outputs/side effects. Don't test implementation details.
- API routes: test via integration tests in `src/test/integration/api/` that hit route handlers with real requests.
- MCP tools: test via their service layer calls (tools are thin wrappers, so testing services covers the logic).
- **Regression tests:** When fixing a bug, optionally write a test that reproduces the bug first (or alongside the fix). The test should fail without the fix and pass with it.

### E2E Testing & Debugging

You can run `npm run dev` to start the dev server, then use the **Kinti MCP tools** to perform end-to-end testing against the running app (create transactions, check budgets, verify portfolio reports, etc.). This is the primary way to validate features and debug issues beyond unit tests.

- Start the server: `npm run dev`
- Use Kinti MCP tools to interact with the app (create data, query reports, verify behavior)
- Add temporary logging (`financialLogger.debug`, etc.) to trace issues — read the server output to see logs. It refreshes automatically when in `dev` mode.
- Clean up debug logging before committing - but only if you think the debug log message is unlikely to be needed again.

### Playwright E2E Tests

Browser-based E2E tests live in `e2e/ui/`. Run with `npm run test:e2e`.

**Three-phase pipeline** (Playwright projects with dependency ordering):
1. `seed-and-tour` — seeded DB: tests tutorial walkthrough, then clears sample data
2. `onboarding` — fresh DB: tests settings wizard (timezone, skip through sections, finish)
3. `main` — configured DB: CRUD tests for transactions, categories, budgets, recurring, assets, reports, navigation

**Infrastructure:**
- `e2e/ui/prepare-db.ts` runs before the server: kills port 4001, removes stale `.next/dev/lock`, deletes old test DB, seeds fresh data.
- Server starts on port 4001 with `DATABASE_URL=./data/test-e2e.db` (isolated from production data).
- DB persists after tests for debugging. Cleaned at the start of the next run.

**Selectors — prefer in this order:**
1. `id` attributes on form fields (`#tx-amount`, `#budget-category`, etc.)
2. `data-testid` attributes for rows and action buttons (`data-testid="budget-row-{id}"`, `data-testid="category-actions-{id}"`)
3. `aria-label` for icon buttons (`aria-label="Edit transaction"`)
4. `data-tour` attributes for page sections
5. `getByRole` / `getByText` as fallback

**shadcn/Radix UI quirks:**
- **Checkbox:** Radix renders `<button role="checkbox">`. Use `.click()`, not `.check()` — Playwright's `.check()` expects native `checked` attribute changes but Radix uses `data-state`.
- **Select inside Dialog:** Options render in a portal outside the dialog. Use unscoped `page.locator("[role='option']").filter({ hasText: "..." })` to find them, not dialog-scoped locators.
- **Select dropdown empty:** Usually means missing test data (e.g. no categories created), not a Radix interaction issue. Check prerequisites first.
- **`data-testid` attributes:** Add them to components to make tests stable. They're inert, ship in production, and cost nothing. No `isDev` checks needed.

**Test data dependencies:**
- Tests within a `describe.serial` block share DB state. Earlier tests create data for later ones.
- Specs in the `main` project run alphabetically. If spec B needs data from spec A, either create it as a precondition in spec B, or ensure A sorts before B.
- Use unique names across specs to avoid conflicts (e.g. budgets creates "Food", transactions creates "Groceries").

---

## Style & Conventions

- File naming: kebab-case for files, PascalCase for components.
- Imports: use `@/` path alias for `src/`.
- Prefer named exports over default exports.
- Keep files under ~400 lines. If longer, split into focused modules.

---

## Documentation

This is intended to be a public open-source project. Maintain documentation accordingly:

- **README.md** — project overview, screenshots, features, setup/install instructions, usage guide, tech stack, contributing guidelines. Keep it up to date as features land.
- **plan.md** — the project plan and sprint tracker. Read it for context on project status and keep it up to date.
- **API docs** — document REST API endpoints (Swagger, from [openapi.ts](src/lib/api/openapi.ts)) and MCP tools (see section below).
- **When adding a new API endpoint**, also: add it to OpenAPI spec (`src/lib/api/openapi.ts`), add a corresponding MCP tool if the AI should be able to call it (`src/lib/mcp/tools/`), and add/update validators (`src/lib/validators/`).
- Keep docs concise and practical. Don't write walls of text — developers should be able to get running in under 5 minutes.
- Update docs when adding or changing user-facing features. Don't let docs drift from reality.

### MCP Tool Documentation

MCP tool schemas have two documentation surfaces — use each for the right kind of information:

**Tool `description`** — purpose, workflow, and behavioral guidance:
- What the tool does and when to use it (vs. similar tools).
- Workflow hints: "call search_symbol first", "use list_categories to find valid IDs".
- Domain conventions that aren't parameter-specific (base-currency deposit pricing rules, idempotency).
- What the tool returns at a high level (only if non-obvious).

**Zod `.describe()` on schema fields** — field-level documentation for both inputs and outputs:
- What the value means: `"Native amount (e.g. 12.10)"`.
- Format hints: `"YYYY-MM-DD"`, `"ISO 8601 datetime"`.
- Defaults (inputs only): `"Defaults to today"`, `"Defaults to 'expense'"`.
- Valid values when not obvious from the enum/type: `"0=Sun, 6=Sat"`.
- Cross-references (inputs only): `"Category ID — use list_categories to find valid values"`.
- For output fields, describe anything not self-evident from the field name: `"Can be negative when over budget"`, `"null if no price recorded"`, `"This category + all descendants"`.
- Skip describes on output fields whose meaning is obvious (e.g. `name`, `id`, `createdAt`).

**Do NOT put in the tool description:**
- Parameter names, types, or formats that the schema already communicates (no `"Params: amount (number), date (YYYY-MM-DD)"` blocks).
- Internal implementation details hidden from the public API (transaction types used internally, how lots are stored, DB column names).
- Return type field listings — the response schema speaks for itself.

---

## What NOT to Do

- Don't over-engineer for hypothetical futures. Build what's needed now.
- Don't add comments that restate what the code already says. Only comment non-obvious "why".
- Don't create wrapper abstractions for things used in one place.
- Don't add `useMemo`/`useCallback`/`React.memo` for performance — the React Compiler handles memoization (see *Components & UI → React Compiler*).
