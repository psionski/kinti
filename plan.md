# Kinti — Personal Finance Tracker

*AI-powered personal finance app. Track spending, scan receipts, manage budgets — with an MCP interface for AI-driven data entry and analysis.*

## Overview

Web dashboard (Next.js) for viewing and analyzing spending. MCP server embedded in the app for AI interaction: receipt scanning, categorization, batch operations, ad-hoc SQL queries.

## Actors

| Actor | What it is | How it interacts with Kinti |
|-------|-----------|----------------------------|
| **User** | The human (app owner). | Browses the web UI from any device. Sends receipts/commands to the AI assistant via Telegram. |
| **AI** | An AI assistant (e.g. built on [OpenClaw](https://github.com/openclaw/openclaw)). May run on the same host or a different machine. | Connects to Kinti's MCP endpoint over HTTP. Uses MCP tools for structured operations (transactions, categories, reports, budgets). Uses companion REST endpoint for binary uploads (receipt images). Discovery: MCP server `instructions` field tells clients about the REST upload endpoint. |

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) | Full-stack: React frontend + API routes + MCP endpoint |
| Language | TypeScript (strict) | End-to-end type safety |
| Styling | Tailwind CSS 4 | Utility-first, fast iteration |
| UI Components | shadcn/ui | Accessible, composable, Tailwind-native |
| Charts | Recharts (via shadcn/ui) | Chart primitives built on Recharts + Tailwind |
| Database | SQLite (via better-sqlite3) | Single file, zero infra, perfect for personal use |
| ORM | Drizzle ORM | Type-safe, SQL-like query builder, great SQLite support |
| Migrations | Drizzle Kit | Schema-driven, generates SQL migrations |
| Validation | Zod | Shared schemas for API, MCP tools, and forms |
| MCP | @modelcontextprotocol/sdk | Streamable HTTP transport, mounted inside Next.js (stateless mode) |
| Scheduling | node-cron | In-process cron via Next.js instrumentation hook |

## Architecture

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

## Access & Security

**Phase 1: Tailscale-only access.** No auth layer in the app initially.

- App binds to `0.0.0.0:<port>` but is only reachable via Tailscale network
- Works on all devices: desktop browser, iOS (Tailscale app), Android
- Optional safety net: middleware that verifies requests come from the Tailscale interface (`100.x.x.x` source IP)
- MCP endpoint is localhost-only — the AI assistant runs on the same host

**Why Tailscale-first:** Single user, personal VPS. Tailscale gives us mutual WireGuard authentication at the network level — good enough to start without building login flows.

**Future: app-level auth.** Keep auth concerns isolated (middleware/route guards), so we can slot in session-based or token-based auth when needed. **Note:** Once auth is added and pages call `cookies()`/`headers()`, Next.js will automatically treat them as dynamic — at that point, remove the `export const dynamic = "force-dynamic"` lines from page files.

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
- **Assets + lots model**: `assets` for metadata, `asset_lots` for buy/sell/deposit/withdrawal events (positive qty = buy, negative = sell), `asset_prices` for user-recorded or auto-fetched valuations.
- **FTS5** virtual table for full-text search on transaction descriptions, merchants, and notes. Kept in sync via triggers (see migrations).

**Price resolution order** (in `src/lib/services/price-resolver.ts`): user-recorded `asset_prices` → provider data in `market_prices` (via `symbolMap`) → lot cost basis → deposit identity (EUR deposits = €1.00).

**`updated_at` management:** No triggers — services are the single mutation path and set `updated_at` explicitly on every UPDATE.

**SQLite PRAGMAs** (set on every connection in `src/lib/db/index.ts`): WAL mode, foreign keys ON, 64MB cache, 5s busy timeout.

## MCP Tools (67 tools)

Tool definitions live in `src/lib/mcp/tools/` (one file per domain), plus `get_started` in `src/lib/mcp/register.ts`. See each file for exact schemas and descriptions.

### Getting Started (1 tool)
`get_started` — returns instructions, conventions, and onboarding flow. AI clients should call this first.

### Transactions (8 tools)
`create_transaction`, `create_transactions` (batch, with optional `receipt_id`), `get_transaction`, `list_transactions` (filter/paginate/search), `update_transaction`, `batch_update_transactions`, `delete_transaction`, `list_tags`

### Categories (7 tools)
`list_categories`, `get_category`, `create_category`, `update_category`, `delete_category`, `recategorize_transactions`, `merge_categories`

### Budgets (4 tools)
`set_budget`, `get_budget_status`, `delete_budget`, `reset_budgets`

### Recurring Transactions (6 tools)
`create_recurring`, `get_recurring`, `list_recurring`, `update_recurring`, `delete_recurring`, `generate_pending_recurring`

### Receipts (4 tools)
`get_receipt`, `list_receipts`, `list_unprocessed_receipts`, `delete_receipt`

### Reporting (6 tools)
`get_spending_summary`, `get_category_stats`, `get_trends`, `get_top_merchants`, `get_net_income`, `get_cash_balance`

### Portfolio Reports (6 tools)
`get_net_worth_history`, `get_asset_performance`, `get_allocation`, `get_currency_exposure`, `get_realized_pnl`, `get_asset_history`

### Assets (10 tools)
`create_asset`, `list_assets`, `get_asset`, `update_asset`, `delete_asset`, `buy_asset`, `sell_asset`, `record_price`, `get_portfolio`, `list_lots`

### Financial Data (5 tools)
`convert_currency`, `get_price`, `search_symbol`, `list_providers`, `set_api_key`

### Backups (3 tools)
`create_backup`, `list_backups`, `restore_backup`

### Onboarding (2 tools)
`set_opening_cash_balance`, `add_opening_asset`

### Settings (2 tools)
`get_timezone`, `set_timezone`

### Sample Data (1 tool)
`clear_sample_data`

### Escape Hatch (2 tools)
`get_db_schema`, `query` (read-only SQL)

## Scheduled Tasks & Recurring Transaction Engine

Three cron jobs run in-process via `node-cron`, started from `src/instrumentation.ts` → `src/lib/cron.ts`:

| Time | Job | Details |
|------|-----|---------|
| 02:00 | Recurring transaction generation | Creates pending transactions from active templates up to today |
| 03:00 | SQLite backup | `.backup` to `data/backups/`, keeps last 7 daily |
| 04:00 | Market price auto-fetch | For each asset with a `symbolMap`, fetches today's price from the linked provider |

**Why in-process cron:** Kinti is self-hosted (long-lived Node.js process, not serverless). `instrumentation.ts` runs exactly once on server start — perfect for scheduling. A `globalThis` singleton guard prevents duplicate jobs from dev-mode hot-reload.

**Recurring engine behavior:**
1. Templates define amount, description, category, frequency, schedule details, start/end date
2. Engine tracks `last_generated` per template
3. Runs daily via cron + on first request after startup via middleware + manually via `generate_pending_recurring` MCP tool
4. Generated transactions are normal rows linked via `recurring_id` — independently editable/deletable
5. Deactivating a template stops future generation but doesn't touch existing transactions

## MCP Integration Details

The MCP server runs inside Next.js as a **stateless** Streamable HTTP endpoint at `/api/mcp` (see `src/app/api/mcp/route.ts`).

**Key decisions:**
- **Stateless mode:** `sessionIdGenerator: undefined` — no session headers, no SSE resumption. Each POST creates a fresh server, handles the request, tears down. Fits Next.js route handlers perfectly.
- **JSON responses:** `enableJsonResponse: true` — plain JSON, no streaming needed for tool calls.
- **Server instructions:** The `McpServer` `instructions` field advertises the companion REST endpoint for receipt uploads. This is how AI clients discover that binary uploads go through REST, not MCP.

## Web UI Pages

### Dashboard (`/`)
- **KPI cards:** Total spend this month, vs last month (delta + percentage), top category, budget utilization percentage
- **Spending trend:** Area chart, last 6 months
- **Category breakdown:** Donut chart, current month
- **Recent transactions:** Last 10-20 entries with category badges
- **Budget alerts:** Categories approaching (>80%) or over budget
- **Upcoming recurring:** Next 5 recurring transactions due
- **Net worth card + sparkline:** Total net worth with 6-month mini area chart
- **Top movers:** Assets with biggest P&L change this month
- **Allocation mini-donut:** Portfolio allocation at a glance

### Transactions (`/transactions`)
Full transaction list with sortable columns, filter bar (date range, category, amount range, text search, type toggle), inline edit, bulk select, receipt/recurring indicator badges.

### Categories (`/categories`)
Tree view showing hierarchy, per-category spend + transaction count + budget status, CRUD, merge UI, click-through to filtered transactions.

### Assets (`/assets`)
Summary cards (net worth, invested, P&L, cash balance), performance table, allocation donut + currency exposure bar. Asset detail (`/assets/[id]`): value-over-time chart, lot history, price history, P&L breakdown.

### Cash Flow (`/reports/cash-flow`)
Date range picker, spending by category, trends, merchant breakdown, budget vs actual, income vs expenses. (`/reports` redirects here.)

### Portfolio (`/reports/portfolio`)
Net worth over time, allocation breakdown, performance ranking, realized vs unrealized P&L, transfer flow.

*Sidebar groups: **Track** (Transactions, Assets, Recurring), **Plan** (Categories, Budgets), **Reports** (Cash Flow, Portfolio).*

### Settings (`/settings`)
Timezone selector (required on first run — onboarding gate), API key management for financial data providers.

### Budgets (`/budgets`)
Monthly budgets per category, visual progress bars (green/yellow/red), copy from previous month, historical adherence chart.

### Recurring (`/recurring`)
Template list with description, amount, frequency, next occurrence, status. Create/edit form, toggle active/inactive, view generated transactions.

## Receipt Flow

Receipt images are binary — MCP tools accept only JSON. So uploads go through a **companion REST endpoint**:

1. `POST /api/receipts/upload` — multipart/form-data. Saves image to `data/receipts/YYYY-MM/`, creates DB row, returns `{ receipt_id }`.
2. MCP `create_transactions` accepts `receipt_id` to link line items.
3. `GET /api/receipts/[id]/image` — streams the image with correct `Content-Type`.

**AI workflow:** User sends receipt photo → AI extracts items via vision → uploads image via REST → calls `create_transactions` with line items + `receipt_id`. Each item categorized independently.

**Discovery:** AI clients learn about the REST endpoint via MCP server `instructions` field.

## API Conventions

### Error response contract

All API routes and MCP tools return a consistent error shape with `error` (message), `code` (`VALIDATION_ERROR | NOT_FOUND | CONFLICT | INTERNAL_ERROR`), and optional `details`. See `src/lib/api/helpers.ts` for the `errorResponse` helper.

### Pagination contract

All list endpoints: `limit` (default 50, max 200) + `offset` (default 0). Response envelope: `{ data, total, limit, offset, hasMore }`. Shared Zod schema in `src/lib/validators/common.ts`.

### Tags

Stored as JSON text arrays on transactions and recurring templates. Filter via `json_each()` in SQLite (OR logic). Dedicated `list_tags` tool for autocomplete. No separate tags table — intentionally simple.

## Currency

Kinti is **multi-currency**. Each instance picks an immutable **base currency** at onboarding (any ISO 4217 code, default EUR). All reports, budgets, cash balance, and net worth are denominated in the base. Transactions store both their native amount/currency and a denormalized `amount_base` computed at write time via the configured FX provider chain (Frankfurter → fawazahmed0). The base currency cannot be changed after setup — migrating between bases requires a fresh database. See the *Currency Conventions* section in `CLAUDE.md` for service-layer details.

## Data Storage

- **Database:** `data/kinti.db` (SQLite, gitignored)
- **Receipt images:** `data/receipts/YYYY-MM/receipt-{id}.{ext}` (gitignored)
- **Backups:** `data/backups/kinti-YYYY-MM-DD.db` (daily, last 7 kept)

## Project Structure

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

## Development Sprints

Each sprint is a self-contained chunk of work. Sprints are organized into two phases: **MVP** and **Full App**.

**Completed sprints (1-25, 27):** Project scaffolding, database schema, validators, service layer (transactions, categories, reports, budgets, recurring), API routes, MCP server, scheduled tasks, app shell + dashboard, transactions page, common MCP read operations, categories page, budgets page, recurring page, reports page, receipts flow, financial data service (exchange rates + market prices), assets & net worth tracking (transfer type, asset lots, price snapshots, portfolio), portfolio reports backend (asset–market price linking via symbolMap, unified price resolver, portfolio report services — net worth history, asset performance, allocation, currency exposure, realized P&L, asset history), portfolio reports UI (reports sidebar with Cash Flow / Portfolio sub-pages, portfolio reports page, enhanced assets page with summary cards and charts, asset detail enhancements, dashboard net worth sparkline / top movers / allocation donut, onboarding tools and interactive tutorial), polish & hardening (dark mode, mobile-responsive fixes, error boundaries, streaming symbol search, more financial data providers, E2E Playwright tests, performance tuning, sample data clear flow, decimal amounts refactor — integer cents → real columns end-to-end), npm packaging (`bin/kinti.js` CLI with `kinti start` / `kinti update`, `update-notifier` for background update checks), multi-currency support (immutable base currency, `currency`/`amount_base` columns with async FX conversion at write time, `formatCurrency`, base-currency formatting everywhere, `price_per_unit_base` on lots, `convert_currency` MCP tool, currency picker in transaction form), documentation & open-source setup (README, LICENSE, CONTRIBUTING.md, Swagger API docs, extended MCP `instructions`, dotfiles).

---

### Sprint 26: Project Website
**Goal:** Create a public face for the project.

- [ ] Build a standalone project website (e.g., hosted on GitHub Pages) to serve as the main landing page and documentation hub
- [ ] Write definitive Quick Start installation instructions hosted on the website, specifically formatted for an AI agent (so a user can just drop the URL to their agent to deploy Kinti)
- [ ] Donation button / MCP instructions ("if user is saving lots of money...")

### Sprint 28: UI Translations (i18n)
**Goal:** Make Kinti translatable with full translator context — translators should understand what each string means and where it appears, not just see a flat key-value file.

**Library:** next-intl (purpose-built for Next.js App Router, native server/client component support, ICU message format built-in, PO extraction with source file references and descriptions).

**Phase 1 — Infrastructure**
- [ ] **Install & configure next-intl** — `next-intl` package, Next.js plugin, `getRequestConfig`, `NextIntlClientProvider` in root layout. English as default locale, locale detection from browser `Accept-Language` header with user override in settings.
- [ ] **Namespace structure** — split messages by domain (matching service layer): `common`, `navigation`, `transactions`, `categories`, `budgets`, `recurring`, `portfolio`, `reports`, `settings`, `onboarding`. Nested keys encode UI location (e.g. `table.columns.amount`, `form.amount.placeholder`, `filters.dateRange`).
- [ ] **Key naming convention** — document in CLAUDE.md: keys must encode their UI context via the path. `{namespace}.{section}.{element}.{variant}` pattern. Examples: `Transactions.table.columns.amount` (column header), `Transactions.form.amount.label` (form label), `Transactions.form.amount.placeholder` (input placeholder).
- [ ] **Extraction pipeline** — configure next-intl extraction to output `.po` files with source file references and inline descriptions. Add `npm run i18n:extract` script.
- [ ] **Locale switcher** — add a language selector to the settings page. Store preferred locale in the `settings` table (key: `locale`). Default to browser locale, fall back to `en`.
- [ ] **Locale routing** — configure Next.js middleware for locale-aware routing (`/en/transactions`, `/bg/transactions`). Persist user's locale choice across sessions.

**Phase 2 — Migrate existing strings**
- [ ] **Common namespace** — extract shared strings: button labels (Save, Cancel, Delete, Edit), status words (Loading, Error, Empty), confirmation dialogs, toast messages.
- [ ] **Navigation namespace** — sidebar items, page titles, breadcrumbs.
- [ ] **Transactions namespace** — table headers, form labels/placeholders, filter labels, empty states, action menus.
- [ ] **Categories namespace** — tree view labels, form, merge dialog, stats.
- [ ] **Budgets namespace** — budget cards, form, progress labels, status text.
- [ ] **Recurring namespace** — template list, form, generation status.
- [ ] **Portfolio namespace** — asset cards, lot table, performance metrics, buy/sell dialogs.
- [ ] **Reports namespace** — chart titles, legends, summary labels, date range presets.
- [ ] **Settings namespace** — section headers, field labels, API key form, timezone selector.
- [ ] **Onboarding namespace** — tutorial steps, wizard prompts, sample data notice.

**Phase 3 — Translator experience**
- [ ] **Inline descriptions for ambiguous strings** — audit all extracted strings. For any string where the meaning isn't clear from the key path alone (e.g. "Balance", "Note", "Right", "Net"), add descriptions via `t({ message: '...', description: '...' })`.
- [ ] **ICU plurals & formatting** — convert plural constructs (e.g. "3 transactions", "1 item") to ICU `{count, plural, ...}` syntax. Use ICU `{amount, number}` for formatted numbers where applicable.
- [ ] **Crowdin setup** — register Kinti on Crowdin (free OSS plan). Configure Crowdin CLI for CI push/pull. Upload `.po` files. Tag screenshots for key pages (dashboard, transactions, budgets, portfolio, settings).
- [ ] **Bulgarian translation** — add `bg.json` as the first non-English locale. Translate all namespaces.
- [ ] **Contributing guide for translators** — add a section to CONTRIBUTING.md explaining how to contribute translations via Crowdin, what context is available (key paths, descriptions, screenshots), and how to request new languages.

**Done when:** All user-visible strings are extracted and translatable. A translator on Crowdin can see key paths, descriptions, and screenshots for context. The app renders in English and Bulgarian, switchable from settings. Adding a new language requires only translation files — no code changes.

---

## Future Considerations (not in scope now, but design should accommodate)

- **CSV export:** Export any filtered transaction view as CSV.
- **CSV/OFX import:** Bank statement import. Service layer already structured for batch inserts. Add a parser + import UI/MCP tool when needed.
- **Attachments:** Beyond receipts — invoices, contracts. Generalize receipt storage to a generic attachments table.
- **App-level auth:** Session-based or token-based auth for shared access or public exposure. Keep auth concerns in middleware/route guards so this can be slotted in cleanly.
- **Shared access:** Multiple users or shared household access. Auth is a prerequisite.
