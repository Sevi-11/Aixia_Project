// Safari tints its status-bar strip and bottom toolbar from
// <meta name="theme-color">. These values must track --surface-0 for each
// palette in globals.css, or the browser frames the page in the opposite
// colour to the one the page is actually painted in.
//
// Shared rather than repeated because three places need them and they must
// never drift: the static meta Next emits (layout.js `viewport`), the
// pre-paint bootstrap that corrects it before Safari reads it, and the
// toggle handler that rewrites it later (ChatWindow).
export const THEME_TINT = { light: "#F4F1EA", dark: "#0A1128" };
