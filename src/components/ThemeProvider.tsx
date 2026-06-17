"use client";

import { ThemeProvider } from "next-themes";
import { type ReactNode } from "react";

export default function Providers({
  children,
  nonce,
}: {
  children: ReactNode;
  nonce?: string;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="theme"
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  );
}
