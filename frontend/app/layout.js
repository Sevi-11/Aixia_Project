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
  // Tints Safari's own chrome to the app's canvas, so the status-bar strip
  // reads as part of the page instead of a band the header hides behind.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F1EA" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1128" },
  ],
  // The composer is pinned to the bottom of a 100dvh shell. The default
  // ("resizes-visual") leaves the layout viewport at full height when the
  // keyboard opens, so the composer stays underneath it; this shrinks the
  // layout instead, keeping the field and the last message in view.
  interactiveWidget: "resizes-content",
};

// Runs before first paint, so a returning visitor never sees the light palette
// flash before React hydrates and reads their saved choice. The design is
// dark-first, so anything unreadable from storage falls back to dark.
const THEME_BOOTSTRAP = `
(function () {
  try {
    var saved = localStorage.getItem('aixia-theme');
    document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${abrilFatface.variable} ${comfortaa.variable} ${inter.variable} ${ibmPlexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
