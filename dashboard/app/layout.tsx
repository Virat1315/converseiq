import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ConverseIQ — AI Phone Screening",
  description:
    "Call candidates with an AI agent, ask a fixed set of screening questions, and rank the answers into a shortlist.",
};

/**
 * Without this, phones render the page at a notional desktop width and then
 * zoom out — the layout is technically responsive but nobody ever sees the
 * mobile version of it.
 *
 * maximumScale is deliberately left alone: blocking pinch-zoom breaks the page
 * for anyone who needs to magnify it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
