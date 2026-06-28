# Kinti — Plan & Sprint Tracker

*Work status and roadmap. For architecture, system design, and coding standards, see `ARCHITECTURE.md`.*

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
- [ ] **Key naming convention** — document in ARCHITECTURE.md: keys must encode their UI context via the path. `{namespace}.{section}.{element}.{variant}` pattern. Examples: `Transactions.table.columns.amount` (column header), `Transactions.form.amount.label` (form label), `Transactions.form.amount.placeholder` (input placeholder).
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
