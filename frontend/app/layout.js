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
