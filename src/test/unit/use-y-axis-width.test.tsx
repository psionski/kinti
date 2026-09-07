// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { touchesYAxis, useYAxisWidth } from "@/hooks/use-y-axis-width";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag: string, className: string): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute("class", className);
  return element;
}

/** The part of a Recharts chart this hook cares about, plus the parts it must ignore. */
function buildChart(
  container: HTMLElement,
  tickValues: string[]
): { surface: SVGElement; axis: SVGElement; tooltip: HTMLElement } {
  const surface = svg("svg", "recharts-surface");
  const axis = svg("g", "recharts-yAxis yAxis");
  for (const value of tickValues) {
    const tick = svg("g", "recharts-cartesian-axis-tick");
    const label = svg("text", "recharts-cartesian-axis-tick-value");
    label.append(document.createTextNode(value));
    tick.append(label);
    axis.append(tick);
  }
  surface.append(axis);

  const tooltip = document.createElement("div");
  tooltip.className = "recharts-tooltip-wrapper";
  container.append(surface, tooltip);
  return { surface, axis, tooltip };
}

/** jsdom has no layout, so stand in for it: 7px per character. */
let getBBox: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getBBox = vi.fn(function (this: SVGElement) {
    return { width: this.textContent.length * 7 };
  });
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    value: getBBox,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Let the observer's microtask and the animation frame it schedules both run. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });
}

function Harness(): React.ReactElement {
  const [chartRef, yAxisWidth] = useYAxisWidth();
  return <div data-testid="chart" data-width={yAxisWidth} ref={chartRef} />;
}

describe("touchesYAxis", () => {
  let container: HTMLElement;
  let parts: ReturnType<typeof buildChart>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    parts = buildChart(container, ["0", "500"]);
  });

  afterEach(() => {
    container.remove();
  });

  /** Records only come from a real observer, so drive one. */
  async function recordsFor(mutate: () => void): Promise<MutationRecord[]> {
    const seen: MutationRecord[] = [];
    const observer = new MutationObserver((records) => seen.push(...records));
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    mutate();
    await Promise.resolve();
    observer.disconnect();
    return seen;
  }

  it("accepts a tick label whose text changed", async () => {
    const label = parts.axis.querySelector(".recharts-cartesian-axis-tick-value");
    const records = await recordsFor(() => {
      (label?.firstChild as Text).data = "1,000";
    });

    expect(records.length).toBeGreaterThan(0);
    expect(touchesYAxis(records)).toBe(true);
  });

  it("accepts ticks being added to the axis", async () => {
    const records = await recordsFor(() => {
      parts.axis.append(svg("g", "recharts-cartesian-axis-tick"));
    });

    expect(touchesYAxis(records)).toBe(true);
  });

  it("accepts the axis itself arriving, reported against its parent", async () => {
    parts.axis.remove();
    const records = await recordsFor(() => {
      parts.surface.append(parts.axis);
    });

    expect(touchesYAxis(records)).toBe(true);
  });

  it("accepts an axis arriving nested inside a larger subtree", async () => {
    const layer = svg("g", "recharts-layer");
    layer.append(svg("g", "recharts-yAxis yAxis"));
    const records = await recordsFor(() => {
      parts.surface.append(layer);
    });

    expect(touchesYAxis(records)).toBe(true);
  });

  it("ignores the tooltip mounting and its text changing", async () => {
    const mounting = await recordsFor(() => {
      const content = document.createElement("div");
      content.textContent = "March: 1,234.00";
      parts.tooltip.append(content);
    });
    expect(mounting.length).toBeGreaterThan(0);
    expect(touchesYAxis(mounting)).toBe(false);

    const moving = await recordsFor(() => {
      (parts.tooltip.firstChild?.firstChild as Text).data = "April: 2,345.00";
    });
    expect(moving.length).toBeGreaterThan(0);
    expect(touchesYAxis(moving)).toBe(false);
  });

  it("ignores dots mounting when an entry animation finishes", async () => {
    const records = await recordsFor(() => {
      const layer = svg("g", "recharts-area-dots");
      layer.append(svg("circle", "recharts-dot"), svg("circle", "recharts-dot"));
      parts.surface.append(layer);
    });

    expect(records.length).toBeGreaterThan(0);
    expect(touchesYAxis(records)).toBe(false);
  });

  it("ignores the active dot and cursor a hover adds", async () => {
    const records = await recordsFor(() => {
      parts.surface.append(svg("line", "recharts-tooltip-cursor"));
      parts.surface.append(svg("circle", "recharts-active-dot"));
    });

    expect(touchesYAxis(records)).toBe(false);
  });
});

describe("useYAxisWidth", () => {
  it("measures the widest tick label once the axis renders", async () => {
    const { getByTestId, unmount } = render(<Harness />);
    const container = getByTestId("chart");

    // Nothing to measure yet: the initial width stands rather than collapsing.
    expect(container.dataset.width).toBe("40");

    await act(async () => {
      buildChart(container, ["0", "2,500", "10,000"]);
    });
    await settle();

    // "10,000" is 6 characters wide at 7px, plus the 8px tick gap.
    expect(container.dataset.width).toBe("50");
    unmount();
  });

  it("does not measure when only the tooltip changes", async () => {
    const { getByTestId, unmount } = render(<Harness />);
    const container = getByTestId("chart");
    const parts = buildChart(container, ["0", "2,500", "10,000"]);
    await settle();

    getBBox.mockClear();
    await act(async () => {
      const content = document.createElement("div");
      content.textContent = "March: 1,234.00";
      parts.tooltip.append(content);
    });
    await settle();
    await act(async () => {
      (parts.tooltip.firstChild?.firstChild as Text).data = "April: 2,345.00";
    });
    await settle();

    expect(getBBox).not.toHaveBeenCalled();
    unmount();
  });

  it("re-measures when the tick labels themselves change", async () => {
    const { getByTestId, unmount } = render(<Harness />);
    const container = getByTestId("chart");
    const parts = buildChart(container, ["0", "50"]);
    await settle();
    expect(container.dataset.width).toBe("22");

    getBBox.mockClear();
    await act(async () => {
      const labels = parts.axis.querySelectorAll(".recharts-cartesian-axis-tick-value");
      (labels[1]?.firstChild as Text).data = "1,000,000";
    });
    await settle();

    expect(getBBox).toHaveBeenCalled();
    // "1,000,000" is 9 characters wide at 7px, plus the 8px tick gap.
    expect(container.dataset.width).toBe("71");
    unmount();
  });

  it("stops measuring once unmounted", async () => {
    const { getByTestId, unmount } = render(<Harness />);
    const container = getByTestId("chart");
    const parts = buildChart(container, ["0", "50"]);
    await settle();

    getBBox.mockClear();
    unmount();
    (parts.axis.querySelector(".recharts-cartesian-axis-tick-value")?.firstChild as Text).data =
      "1,000,000";
    await settle();

    expect(getBBox).not.toHaveBeenCalled();
  });
});
