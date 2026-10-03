"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_TINT } from "./themeTint";

// v2: the previous key was written on first paint even when the reader had
// never touched the toggle, so it recorded the old dark default as though it
// were a preference. Those values are indistinguishable from real choices,
// so the key is retired rather than migrated.
const THEME_KEY = "aixia-theme-v2";

// The bootstrap in layout.js sets this correctly before first paint; this
// keeps it right when the theme is toggled afterwards.
function syncBrowserChrome(theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_TINT[theme] || THEME_TINT.light);
}

export function useTheme() {
  // Seeded from the attribute the bootstrap script in layout.js set before
  // first paint. Deriving it here rather than in an effect matters: an effect
  // would land a second render that the theme effect below cannot tell apart
  // from someone hitting the toggle, so it would crossfade and persist on
  // every load. `document` is absent on the server, which yields the same
  // "light" the server rendered.
  const [theme, setTheme] = useState(() => (
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  ));

  // Skips the first run: the theme is already correct at first paint (the
  // bootstrap script in layout.js sets it), and crossfading into it would look
  // like the page loading wrong and then correcting itself.
  const themeSettled = useRef(false);
  useEffect(() => {
    const root = document.documentElement;

    if (themeSettled.current) {
      // Flip the theme with a centre-out circle reveal (View Transitions API,
      // see ::view-transition in globals.css). `.theme-transition` suppresses
      // every element's own transition so the new snapshot is the finished
      // theme, not a mid-fade -- the circle is the only motion. Browsers without
      // the API (or under reduced-motion) just snap.
      const apply = () => {
        root.classList.add("theme-transition");
        root.setAttribute("data-theme", theme);
        syncBrowserChrome(theme);
      };
      const settle = () => root.classList.remove("theme-transition");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let done;
      if (document.startViewTransition && !reduce) {
        document.startViewTransition(apply).finished.finally(settle);
      } else {
        apply();
        done = setTimeout(settle, 60);
      }
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Storage can be disabled; the theme still applies for this session.
      }
      return () => clearTimeout(done);
    }

    // Adoption pass, not a choice: apply what is already on screen and write
    // NOTHING. Persisting here is what pinned every first-time visitor to
    // whatever the default happened to be on the day they first loaded.
    themeSettled.current = true;
    root.setAttribute("data-theme", theme);
    syncBrowserChrome(theme);
  }, [theme]);

  return [theme, setTheme];
}
