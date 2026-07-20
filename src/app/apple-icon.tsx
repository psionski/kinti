import { renderAppIcon } from "@/lib/pwa-icon";

// Apple touch icon for iOS "Add to Home Screen". iOS ignores the web manifest
// icons and uses this instead; it also has no icon masking, so use the
// non-maskable (self-rounded, opaque) variant.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
