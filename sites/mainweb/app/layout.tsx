// app/layout.tsx
import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font";
import "./globals.css";

const geistSansVar = GeistSans.variable;
const geistMonoVar = GeistMono.variable;

export const metadata: Metadata = {
  title: "DSGT | Georgia Tech",
  description:
    "The largest student-run data science organization at Georgia Tech.",
  authors: [{ name: "aamoghS" }],
};

import { TRPCReactProvider } from "@/lib/trpc-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSansVar} ${geistMonoVar}`}>
      <body
        suppressHydrationWarning
        className="antialiased bg-[#050505] text-gray-400"
      >
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
