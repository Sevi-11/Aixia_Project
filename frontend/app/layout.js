import { Abril_Fatface, Comfortaa, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const abrilFatface = Abril_Fatface({
  variable: "--font-abril-fatface",
  subsets: ["latin"],
  weight: ["400"],
});

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "AIxia | Your personal RAG assistant",
  description: "Ask AIxia grounded questions about Engr. Sean's background.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately no maximumScale/userScalable: pinch-zoom stays available.
  //
  // Tints Safari's own chrome to the app's canvas, so the status-bar strip
  // reads as part of the page rather than a band the header hides behind. One
  // flat value, not a pair keyed on prefers-color-scheme: the theme here is a
  // choice made in the header, not one the OS makes, so media-scoped values
  // would tint the chrome against the actual page half the time. ChatWindow
  // rewrites this whenever the theme is toggled.
  themeColor: "#F4F1EA",
  // The composer is pinned to the bottom of a 100dvh shell. The default
  // ("resizes-visual") leaves the layout viewport at full height when the
  // keyboard opens, so the composer stays underneath it; this shrinks the
  // layout instead, keeping the field and the last message in view.
  interactiveWidget: "resizes-content",
};

// Runs before first paint. Both of these are decisions the server cannot make
// -- one depends on storage, the other on viewport width -- so resolving them
// in React would mean painting a guess and correcting it after hydration. The
// visible cost of that is a palette flash, or a full-screen drawer that flaps
// open and shut on every phone load. CSS keys off these attributes for the
// pre-hydration frame; ChatWindow adopts them on mount and then owns the state.
//
// iPad mini portrait is 744px. At or above it the sidebar has room to sit in
// the layout and starts open; below it the sidebar is an overlay, and an
// overlay must never be covering the page on arrival.
const BOOTSTRAP = `
(function () {
  var root = document.documentElement;
  var theme = 'light';
  var collapsed = window.innerWidth < 744;
  try {
    if (localStorage.getItem('aixia-theme-v2') === 'dark') theme = 'dark';
    if (!collapsed) {
      var rail = localStorage.getItem('aixia-sidebar-open');
      collapsed = rail === null ? false : rail !== 'true';
    }
  } catch (e) {
    // Storage can be unavailable (private mode, blocked cookies); the
    // width-derived default above still stands.
  }
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-rail', collapsed ? 'collapsed' : 'expanded');
})();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${abrilFatface.variable} ${comfortaa.variable} ${inter.variable} ${ibmPlexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
