# Contributing to Kinti

## Getting Started

```bash
git clone https://github.com/psionski/kinti.git
cd kinti
npm install
cp .env.example .env
npm run dev
```

The dev server starts on [http://localhost:4000](http://localhost:4000) with hot-reload.

## Project Structure

```
src/
├── app/              # Next.js pages + API routes + MCP endpoint
├── components/       # React components (per-domain dirs + ui/)
├── lib/
│   ├── services/     # Business logic (one service per domain)
│   ├── validators/   # Zod schemas (shared by API, MCP, forms)
│   ├── mcp/          # MCP server + tool definitions
│   ├── api/          # Route helpers, service factories, OpenAPI spec
│   ├── db/           # Drizzle schema, connection, seed
│   └── providers/    # Financial data providers
├── test/             # All tests (NOT colocated with source)
e2e/                  # Playwright E2E tests
drizzle/              # Generated migrations
```

## Key Principles

- **Service layer is the single source of truth.** API routes and MCP tools are thin wrappers — validate input, call service, format output.
- **Zod schemas** are the source of truth for validation. TypeScript types are inferred from them via `z.infer<>`.
- **No logic duplication.** If two entry points need the same operation, it lives in the service layer.
- **TypeScript strict mode.** No `any` types.

## Database

Schema lives in `src/lib/db/schema.ts`. All changes go through Drizzle Kit migrations:

```bash
# After editing schema.ts:
npm run db:generate   # Generate migration SQL
npm run db:migrate    # Apply it
```

Never modify the database manually. Use `npm run db:studio` to browse data.

## Tests

Tests live in `src/test/` — never colocated with source files.

```bash
npm test              # Unit + integration tests (Vitest)
npm run test:e2e      # Browser E2E tests (Playwright)
```

- **Naming:** `{domain}.service.test.ts` for service tests, `{domain}.api.test.ts` for API route tests
- **DB:** Use `makeTestDb()` from `src/test/helpers.ts` for in-memory SQLite. No mocks for the database.
- **Focus:** Test the service layer — that's where the business logic lives.

## Code Quality

Before submitting, both must pass with zero errors:

```bash
npm run check         # Typecheck (tsc) + lint (ESLint) + format (Prettier)
npm test              # Unit + integration tests
```

## Style

- **Files:** kebab-case (e.g. `asset-service.ts`). Components are PascalCase (e.g. `BudgetCard.tsx`).
- **Imports:** Use `@/` path alias for `src/`.
- **Exports:** Named exports, not default.
- **Line length:** Keep files under ~400 lines. Split if longer.
- **Comments:** Only when the "why" isn't obvious from the code.

## Adding Features

When adding a new feature, you'll typically touch:

1. **Service** (`src/lib/services/`) — business logic
2. **Validator** (`src/lib/validators/`) — Zod schemas for input/output
3. **API route** (`src/app/api/`) — REST endpoint (thin wrapper around service)
4. **MCP tool** (`src/lib/mcp/tools/`) — tool definition (thin wrapper around service)
5. **OpenAPI spec** (`src/lib/api/openapi.ts`) — document the REST endpoint
6. **Tests** (`src/test/`) — service layer tests at minimum
7. **UI** (`src/components/`, `src/app/`) — if user-facing

## Publishing to npm

Releases are published automatically via GitHub Actions when a version tag is pushed. The workflow runs all checks (typecheck, lint, format, tests) and then `npm publish`.

### Prerequisites

1. An npm account with publish access to the `kinti` package.
2. A GitHub repository secret named `NPM_TOKEN` set to an npm access token with publish permissions (`Automation` type recommended so it bypasses 2FA).
   - Generate at: npmjs.com → Account → Access Tokens → Generate New Token.
   - Add at: GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

### Cutting a release

```bash
# 1. Bump the version in package.json
npm version patch   # or minor / major
#    This commits the bump and creates a local tag (e.g. v0.1.1).

# 2. Push the commit and tag
git push origin main --follow-tags
```

Pushing the `v*` tag triggers the publish workflow. Monitor it under the Actions tab on GitHub.

### What the workflow does

1. Checks out the repo and sets up Node 20 with the npm registry.
2. Runs `npm ci`, `npx tsc --noEmit`, `npm run check`, and `npm test`.
3. Runs `npm run build` to produce the `.next/` output included in the package.
4. Runs `npm publish` authenticated via `NODE_AUTH_TOKEN`.

The `prepack` script automatically strips the `.next/cache` and `.next/dev` directories before packing to keep the published artifact small.

## Pull Requests

- One focused change per PR.
- Descriptive title, brief summary of what and why.
- All checks must pass (typecheck, lint, format, tests).
- Screenshots for UI changes.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE).
