# Plan: MCP Tool UX Review via Simulated Agent Workflows

## Context
The MCP server exposes 54 tools across 10 domains. Tool names, descriptions, and the top-level `INSTRUCTIONS` constant are the only guidance an AI agent gets when deciding which tools to call and in what order. Poor naming, vague descriptions, or missing cross-references lead to wasted tool calls, wrong parameters, or broken multi-step workflows. This review simulates realistic agent sessions to surface those issues.

## Approach

Launch **6 parallel "tester" agents**, each playing the role of an AI agent trying to accomplish a specific end-to-end workflow. Each agent receives:
- The full list of tool names and descriptions (as an agent would see them)
- The `INSTRUCTIONS` constant
- A realistic user prompt

Each agent evaluates:
1. **Discoverability** — Could it find the right tool(s) by name/description alone?
2. **Description clarity** — Were parameters, formats, and constraints clear?
3. **Cross-tool guidance** — For multi-step flows, did descriptions/instructions explain the sequence?
4. **Naming consistency** — Any confusing overlaps, inconsistencies, or misleading names?
5. **Missing tools or gaps** — Anything the agent needed but couldn't find?

### The 6 Workflows

| # | Workflow | User prompt (simulated) | Key tools expected |
|---|----------|------------------------|--------------------|
| 1 | **New user onboarding** | "I just installed Kinti. I have €5,000 in savings, a €2,000 stock portfolio, and some crypto. Set me up." | Onboarding tools (if discoverable), create_asset, buy_asset, search_symbol, list_categories |
| 2 | **Receipt-based expense entry** | "I just got back from the grocery store. Here's my receipt — total was €47.30 for groceries." | Receipt upload (REST), create_transactions, list_categories, get_receipt |
| 3 | **Monthly budget check** | "How am I doing on my budgets this month? Am I overspending anywhere?" | get_budget_status, get_category_stats, get_spending_summary, get_trends |
| 4 | **Investment portfolio management** | "I just bought 5 shares of VWCE at €112.50 each. Also, how's my portfolio doing overall?" | search_symbol, buy_asset, get_portfolio, get_asset_performance, get_allocation |
| 5 | **Foreign currency travel expenses** | "I was in the US last week and spent $45.00 on dinner and $120.00 on a hotel. Enter these as EUR." | convert_currency, create_transaction or create_transactions, list_categories |
| 6 | **Category cleanup & reorganization** | "I have duplicate categories 'Food' and 'Groceries'. Merge them, then recategorize all transactions from merchant 'Lidl' into the merged category." | list_categories, merge_categories, recategorize |

### Bonus evaluations (each agent also checks)
- What happens if the agent doesn't know about onboarding tools — are they discoverable?
- Is the `query` escape hatch well-signposted for edge cases?
- Are `get_` vs `list_` naming conventions consistent and intuitive?

## Execution

1. Launch 6 agents in parallel, each with the tool catalog + one workflow
2. Each agent writes structured notes (discoverability score, issues found, suggestions)
3. Compile all feedback into `mcp_review.md` at the project root

## Files involved
- **Read only:** `src/lib/mcp/server.ts` (INSTRUCTIONS), all files in `src/lib/mcp/tools/`
- **Write:** `mcp_review.md` (output)

## Verification
- Review `mcp_review.md` for actionable, specific feedback
- Each issue should reference the exact tool name and quote the problematic description
