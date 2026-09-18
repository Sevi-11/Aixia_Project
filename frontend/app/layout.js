import { Abril_Fatface, Comfortaa, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { THEME_TINT } from "../components/themeTint";

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
  themeColor: THEME_TINT.light,
  // The composer is pinned to the bottom of a 100dvh shell. The default
  // ("resizes-visual") leaves the layout viewport at full height when the
  // keyboard opens, so the composer stays underneath it; this shrinks the
  // layout instead, keeping the field and the last message in view.
  interactiveWidget: "resizes-content",
};

// Runs before first paint. The theme is a decision the server cannot make --
// it depends on storage -- so resolving it in React would mean painting a
// guess and correcting it after hydration, which is a palette flash. CSS keys
// off these attributes for the pre-hydration frame; ChatWindow adopts them on
// mount and then owns the state.
//
// The sidebar is an overlay drawer at every width now (no in-layout rail), so
// it always starts collapsed here -- an overlay must never be covering the
// page on arrival, on a phone or a desktop alike.
const BOOTSTRAP = `
(function () {
  var root = document.documentElement;
  var theme = 'light';
  var voice = 'off';
  try {
    if (localStorage.getItem('aixia-theme-v2') === 'dark') theme = 'dark';
    if (localStorage.getItem('aixia-voice') === 'on') voice = 'on';
  } catch (e) {
    // Storage can be unavailable (private mode, blocked cookies); the
    // defaults above still stand.
  }
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-voice', voice);
  // Firefox keeps SpeechRecognition behind a flag. Resolving this here rather
  // than in React keeps the mic button out of the server's HTML/client render
  // disagreement, and CSS hides it when there is no recogniser to drive.
  var stt = typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === 'function';
  root.setAttribute('data-stt', stt ? 'yes' : 'no');
  root.setAttribute('data-rail', 'collapsed');
  var tint = ${JSON.stringify(THEME_TINT)};
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tint[theme]);
})();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-voice="off"
      data-stt="no"
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
