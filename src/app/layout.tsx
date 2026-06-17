import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "@/components/ThemeProvider";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Kolo Kept — Secure Savings Tracker",
  description:
    "A secure digital savings application built with production-grade authentication security.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${outfit.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
