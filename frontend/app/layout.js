import { Bodoni_Moda, Comfortaa, Inter } from "next/font/google";
import "./globals.css";

const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni-moda",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "AIxia | Your personal RAG assistant",
  description: "Ask AIxia grounded questions about Engr. Sean's background.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${bodoniModa.variable} ${comfortaa.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
