"use client";

import { useCallback, useState } from "react";

/** The tick labels a left axis reserves room for. */
const TICK_LABEL_SELECTOR = ".recharts-yAxis .recharts-cartesian-axis-tick-value";

/**
 * Recharts' own gap between a left axis's label and the plot area — its
 * `tickSize` (6) plus `tickMargin` (2) defaults, which the label is anchored to
 * the left of.
 */
const TICK_GAP_PX = 8;

/** What the axis renders at for the frame before it has been measured. */
const INITIAL_WIDTH_PX = 40;

/** Ignore sub-pixel churn; anything smaller is not worth a re-render. */
const SIGNIFICANT_CHANGE_PX = 1;

/**
 * The `width` a chart's `YAxis` should use, measured from the tick labels it
 * actually rendered.
 *
 * Recharts 2 has no auto-sizing axis, and any fixed `width` is wrong in one of
 * two directions: too wide leaves a gutter of dead space beside small numbers,
 * too narrow clips the labels beside large ones. Estimating from the data does
 * not close the gap either — Recharts picks its tick values during the render
 * that needs the width, and rounds the domain outwards while doing it, so the
 * widest label is not knowable beforehand. A proportional font makes it worse
 * still: in Geist "111" and "000" differ by 10px at the same digit count.
 *
 * Measuring sidesteps all of that, and works whatever the tick formatter is.
 * Tick values follow the domain, not the gutter, so the labels do not change
 * when the width does and the measurement settles after a single correction.
 *
 * Attach the returned ref to the element wrapping the chart:
 *
 * ```tsx
 * const [chartRef, yAxisWidth] = useYAxisWidth();
 * <ChartContainer ref={chartRef} …>
 *   <AreaChart …><YAxis width={yAxisWidth} … /></AreaChart>
 * </ChartContainer>
 * ```
 */
export function useYAxisWidth(): readonly [React.RefCallback<HTMLDivElement>, number] {
  const [width, setWidth] = useState(INITIAL_WIDTH_PX);

  // A callback ref rather than an effect over a `useRef`: a chart that starts
  // out as an empty-state message mounts its container later than the component
  // around it, and an effect with a stable dependency list would have already
  // run against a ref that was still null.
  const chartRef = useCallback((container: HTMLDivElement | null) => {
    if (container === null) return;

    const measure = (): void => {
      const labels = container.querySelectorAll<SVGTextElement>(TICK_LABEL_SELECTOR);
      if (labels.length === 0) return;

      let widest = 0;
      for (const label of labels) {
        widest = Math.max(widest, label.getBBox().width);
      }

      const measured = Math.ceil(widest) + TICK_GAP_PX;
      setWidth((current) =>
        Math.abs(current - measured) > SIGNIFICANT_CHANGE_PX ? measured : current
      );
    };

    // Watch the DOM rather than this component's renders: Recharts draws
    // nothing until its container has measured itself, and redraws the ticks on
    // resize and on new data — none of which re-renders the component that owns
    // this hook. Coalescing into a frame keeps the observer cheap when a whole
    // subtree changes at once, and the equality guard above is what stops our
    // own width change from looping back through here.
    let frame = 0;
    const schedule = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return [chartRef, width] as const;
}
