/**
 * Perceptually-even fallback palette for chart series or slices that have no
 * custom color. OKLCH spreads `count` hues evenly around the wheel at a fixed
 * lightness and chroma, so the number of distinct colors scales with the data.
 *
 * `index` is the 0-based position among the colorless items; `count` is how many
 * colorless items there are in total. Pass these so adjacent items (stacked
 * bands, neighbouring pie slices) land on maximally-separated hues.
 */
export function fallbackColor(index: number, count: number): string {
  const hue = (index / Math.max(count, 1)) * 360;
  return `oklch(0.68 0.15 ${hue.toFixed(2)})`;
}
