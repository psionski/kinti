import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Shared renderer for the app's PWA / home-screen icons.
 *
 * Icons are generated at build time (the route handlers and metadata files
 * that call this are statically rendered) so they compile into `.next` and
 * ship with the published package — the repo has no `public/` directory and
 * only `.next/` is included in the npm tarball, so static image files would
 * not be published.
 *
 * A gold coin (echoing the 🪙 favicon) on the app's indigo→violet brand
 * gradient. `maskable` icons keep the coin inside the ~80% safe zone and use a
 * full-bleed background so platforms can mask them into any shape; the "any"
 * variant rounds its own corners for platforms that don't mask.
 */

// Bundled so the monogram uses the app's own Geist face instead of Satori's
// generic fallback. Read once at module load; the icon routes are statically
// rendered, so this only runs at build time (where `src/` exists).
const geistBold = readFileSync(join(process.cwd(), "src/lib/fonts/Geist-Bold.woff"));

export function renderAppIcon(size: number, options?: { maskable?: boolean }): ImageResponse {
  const maskable = options?.maskable ?? false;
  const coin = Math.round(size * (maskable ? 0.6 : 0.72));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <div
        style={{
          width: coin,
          height: coin,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: "linear-gradient(145deg, #fde68a 0%, #f59e0b 100%)",
          border: `${Math.max(2, Math.round(size * 0.03))}px solid #fbbf24`,
          color: "#4c1d95",
          fontFamily: "Geist",
          fontWeight: 700,
          fontSize: Math.round(coin * 0.58),
          // Optical centering: the cap-height glyph sits slightly high in the
          // line box, so nudge it down a hair to look centered in the coin.
          paddingTop: Math.round(coin * 0.04),
        }}
      >
        $
      </div>
    </div>,
    {
      width: size,
      height: size,
      fonts: [{ name: "Geist", data: geistBold, weight: 700, style: "normal" }],
    }
  );
}
