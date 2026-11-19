/**
 * The Daily Californian mobile app's accent color: the color it paints around a page (behind the
 * status bar, and so on), so it should match the page's background.
 *
 * The app gets an article's starting color from the API (`accentColor` in /api/articles/<page>.json,
 * from its `accentColor` frontmatter; left out for the default). A page whose background changes
 * while it's read (e.g. the bodycam story fading to black around its video) tells the app with
 * setAppAccent() as it changes. Any visual can import it:
 *
 *   import { setAppAccent, DEFAULT_ACCENT_COLOR } from "../../../lib/app-accent";
 *   setAppAccent("#0d0d0d", 400); // fade to near-black over 400 ms
 *   setAppAccent(DEFAULT_ACCENT_COLOR, 400); // and back to the default layout's background
 *
 * Outside the app (in a browser), it does nothing.
 */
import { site } from "../config/site";

/** The default layout's background, which the app uses for any article without an accentColor. */
export const DEFAULT_ACCENT_COLOR = site.accentColor;

/** A six-digit hex color, e.g. "#0d0d0d": the only form the app takes. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        dailycalApp?: { postMessage: (message: { accentColor: string; duration: number }) => void };
      };
    };
  }
}

// The last color sent, so a page can call setAppAccent() on every scroll or frame and the app only
// hears about changes. Forgotten when the reader leaves the page, since the next page may change it
// (so a page shown again with the back button sends its color again).
let current: string | undefined;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    current = undefined;
  });
}

/**
 * Sets the app's accent color to `color` (a six-digit hex color, e.g. "#0d0d0d"), fading to it over
 * `durationMs` milliseconds (0: at once). Match the duration to the page's own transition.
 */
export function setAppAccent(color: string, durationMs = 0): void {
  if (!HEX_COLOR.test(color)) {
    console.error(`setAppAccent: "${color}" isn't a six-digit hex color, e.g. "#0d0d0d".`);
    return;
  }
  const accentColor = color.toLowerCase();
  if (accentColor === current) {
    return;
  }
  current = accentColor;
  window.webkit?.messageHandlers?.dailycalApp?.postMessage({ accentColor, duration: durationMs });
}
