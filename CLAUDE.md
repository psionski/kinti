# CLAUDE.md — Project Instructions for Kinti

Kinti is an AI-powered personal finance tracker. Web dashboard (Next.js 16) + an embedded MCP server for AI-driven data entry and analysis. Single-user, self-hosted, SQLite-backed, multi-currency (immutable base currency set at onboarding).

This file is intentionally short. The detailed instructions live in the documents below — load the relevant one before working.

## Important Project Documents

- **ARCHITECTURE.md** — **Read this before any coding task.** The single source of truth for how to build in this repo: system architecture, service-layer pattern, database schema, MCP tools, date/time + currency conventions, code quality standards, testing conventions, and the Definition of Done. If you're writing or changing code, this is the file to read first.
- **plan.md** — Work status and the sprint roadmap. Read it when asked to "start working on Sprint X", to check what's completed vs. pending, or for questions about project status. Keep it up to date as sprints land.
- **CONTRIBUTING.md** — Project setup (clone/install/dev server), the build/check/test commands, the migration workflow, and the npm release/publishing process. Read it for environment setup, "how do I run X", or release-cutting questions.
- **README.md** — Public-facing project overview: features, screenshots, install/usage guide, tech stack. Read/update it when changing user-facing features or onboarding/install instructions.
- **e2e/mcp/prompt.md**, **e2e/mcp/prompt_full.md** — Manual MCP end-to-end test prompts. Reference when validating the MCP server against a running app.

## Documentation Lookup

**Always use Context7 MCP to look up library documentation before writing code that depends on a library** (Next.js, Drizzle, shadcn/ui, Recharts, Zod, MCP SDK, Tailwind, etc.). Don't rely on potentially outdated training data for API surfaces. See ARCHITECTURE.md → *Documentation Lookup* for the workflow.

## Definition of Done

**Work is not complete until all three pass with zero errors** — fix all failures, including pre-existing ones:

1. **Type check:** `npx tsc --noEmit`
2. **Lint + format:** `npm run check`
3. **Tests:** `npm test`

Documentation and unit tests are part of the deliverable. See ARCHITECTURE.md for the full standards.
