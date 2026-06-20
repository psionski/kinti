"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useJoyride, ACTIONS, EVENTS, STATUS, type Status } from "react-joyride";
import type { Step } from "react-joyride";

function waitForPageReady(): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = (): void => {
      const skeleton = document.querySelector('[data-slot="skeleton"]');
      if (!skeleton) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function navigateAndWait(router: ReturnType<typeof useRouter>, target: string): Promise<void> {
  if (window.location.pathname === target) return waitForPageReady();
  router.push(target);
  return new Promise<void>((resolve) => {
    const check = (): void => {
      if (window.location.pathname === target) {
        void waitForPageReady().then(resolve);
      } else {
        setTimeout(check, 50);
      }
    };
    setTimeout(check, 100);
  });
}

function buildSteps(router: ReturnType<typeof useRouter>): Step[] {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return [
    // ── Dashboard ──
    {
      target: "body",
      placement: "center",
      title: "Welcome to Kinti!",
      content:
        "Let\u2019s take a quick tour of your personal finance dashboard. " +
        "You can skip this tour at any time.",
      buttons: ["primary", "skip"],
    },
    {
      target: '[data-tour="kpi-cards"]',
      placement: "bottom",
      title: "At a Glance",
      content:
        "These cards show your key metrics for the current month: total spending, " +
        "transaction count, top category, and budget utilization.",
      before: () => navigateAndWait(router, "/"),
      targetWaitTimeout: 3000,
    },
    {
      target: '[data-tour="spending-section"]',
      placement: "top",
      title: "Spending Charts",
      content:
        "Track your spending trends over time and see how it breaks down by category. " +
        "These charts update automatically as you add transactions.",
      targetWaitTimeout: 3000,
    },
    {
      target: '[data-tour="sidebar-nav"]',
      placement: "right",
      title: "Navigation",
      content:
        "Use the sidebar to navigate between pages: transactions, recurring payments, " +
        "budgets, categories, assets, and reports.",
      targetWaitTimeout: 3000,
    },

    // ── Transactions ──
    {
      target: '[data-tour="transaction-table"]',
      placement: "top",
      title: "Transaction List",
      content:
        "All your transactions live here. Click column headers to sort, " +
        "select rows for bulk actions, and click any transaction to edit it.",
      before: () => navigateAndWait(router, "/transactions"),
      targetWaitTimeout: 3000,
    },
    {
      target: '[data-tour="add-transaction"]',
      placement: "bottom",
      title: "Add Transactions",
      content:
        "Click here to manually add a transaction with amount, category, date, and merchant.",
      targetWaitTimeout: 3000,
    },
    {
      target: '[data-tour="add-receipt"]',
      placement: "bottom",
      title: "Receipt Uploads",
      content:
        "Upload a receipt image here. It won\u2019t be processed immediately \u2014 " +
        "instead it\u2019s queued for your AI assistant to pick up, read, and turn into transactions.",
      targetWaitTimeout: 3000,
    },
    {
      target: '[data-tour="transaction-filters"]',
      placement: "bottom",
      title: "Filter & Search",
      content:
        "Filter by date range, category, type, amount, or search by description. " +
        "Filters combine so you can drill down precisely.",
      targetWaitTimeout: 3000,
    },

    // ── Budgets ──
    {
      target: '[data-tour="budget-table"]',
      placement: "bottom",
      title: "Budget Tracking",
      content:
        "Set monthly budgets per category and track progress with visual progress bars. " +
        "Budgets inherit forward \u2014 set once, and they carry over to future months.",
      before: () => navigateAndWait(router, "/budgets"),
      targetWaitTimeout: 3000,
    },

    // ── Assets ──
    {
      target: '[data-tour="asset-summary"]',
      placement: "bottom",
      title: "Portfolio Overview",
      content:
        "Track savings, investments, and crypto. These cards show your net worth, " +
        "cash balance, total invested, and overall profit/loss at a glance.",
      before: () => navigateAndWait(router, "/assets"),
      targetWaitTimeout: 3000,
    },
    {
      target: '[data-tour="asset-cards"]',
      placement: "top",
      title: "Your Assets",
      content:
        "Each card represents an asset. Kinti fetches market prices automatically " +
        "for linked symbols \u2014 click into any asset to see lots, price history, and performance.",
      targetWaitTimeout: 3000,
    },

    // ── MCP hint (centered modal) ──
    {
      target: "body",
      placement: "center",
      title: "AI Assistant Integration",
      content: <McpHintContent origin={origin} />,
      before: () => navigateAndWait(router, "/"),
    },
  ];
}

function McpHintContent({ origin }: { origin: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const mcpUrl = `${origin}/api/mcp`;

  function handleCopy(): void {
    void navigator.clipboard.writeText(`Connect to the Kinti MCP at ${mcpUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ textAlign: "left" }}>
      <p style={{ marginBottom: 12 }}>
        Kinti has a built-in MCP server that lets AI assistants manage your finances — create
        transactions, scan receipts, query reports, manage budgets, and more.
      </p>
      <p style={{ marginBottom: 8, fontSize: 12, color: "#a3a3a3" }}>
        Send this to your AI assistant:
      </p>
      <div
        onClick={handleCopy}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: copied ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)",
          border: `1px solid ${copied ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.1)"}`,
          borderRadius: 6,
          padding: "10px 12px",
          cursor: "pointer",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 12,
          lineHeight: 1.4,
          transition: "background 0.2s, border-color 0.2s",
        }}
        title="Click to copy"
      >
        <span>Connect to the Kinti MCP at {mcpUrl}</span>
        {copied ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4ade80"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, opacity: 0.5 }}
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: "#737373" }}>
        {copied ? "Copied!" : "Click to copy"}
      </p>
    </div>
  );
}

async function setTutorialComplete(): Promise<void> {
  try {
    await fetch("/api/settings/tutorial", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tutorial: false }),
    });
  } catch {
    // Silently fail — not critical
  }
}

interface InteractiveTourProps {
  initialTutorial: boolean;
}

export function InteractiveTour({
  initialTutorial,
}: InteractiveTourProps): React.ReactElement | null {
  const router = useRouter();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (initialTutorial) {
      // Wait for the page to finish loading (skeleton gone) before starting the tour
      void waitForPageReady().then(() => {
        setTimeout(() => setRun(true), 300);
      });
    }
  }, [initialTutorial]);

  const handleTourEnd = useCallback(() => {
    setRun(false);
    void setTutorialComplete();
    window.dispatchEvent(new CustomEvent("tour-complete"));
    router.push("/");
  }, [router]);

  const steps = useMemo(() => buildSteps(router), [router]);

  const { Tour } = useJoyride({
    continuous: true,
    run,
    steps,
    scrollToFirstStep: true,
    options: {
      scrollOffset: 80,
      primaryColor: "#e8e8e8",
      textColor: "#fafafa",
      backgroundColor: "#2e2e2e",
      arrowColor: "#2e2e2e",
      overlayColor: "rgba(0, 0, 0, 0.75)",
    },
    styles: {
      tooltip: {
        borderRadius: 12,
        maxWidth: 420,
        fontSize: 14,
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.4), 0 2px 10px rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        padding: 20,
      },
      tooltipTitle: {
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 4,
      },
      tooltipContent: {
        lineHeight: 1.6,
      },
      buttonPrimary: {
        borderRadius: 6,
        fontSize: 13,
        padding: "8px 16px",
        color: "#1a1a1a",
      },
      buttonBack: {
        color: "#a3a3a3",
        fontSize: 13,
      },
      buttonSkip: {
        color: "#a3a3a3",
        fontSize: 13,
      },
    },
    locale: {
      back: "Back",
      close: "Close",
      last: "Finish",
      next: "Next",
      skip: "Skip tour",
    },
    onEvent: (data) => {
      if (
        ([STATUS.FINISHED, STATUS.SKIPPED] as Status[]).includes(data.status) ||
        data.action === ACTIONS.CLOSE
      ) {
        handleTourEnd();
      }

      // After Joyride scrolls and renders the tooltip, ensure it's actually visible.
      // Joyride only scrolls the *target* into view — the tooltip itself may end up
      // off-screen (above the sticky header or below the fold).
      if (data.type === EVENTS.TOOLTIP) {
        requestAnimationFrame(() => {
          const floater = document.querySelector<HTMLElement>(".react-joyride__floater");
          if (floater) {
            floater.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        });
      }
    },
  });

  if (!initialTutorial) return null;

  return <>{Tour}</>;
}
