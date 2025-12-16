// app/layout.tsx
import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font"; // combine imports
import "./globals.css";

const geistSansVar = GeistSans.variable;
const geistMonoVar = GeistMono.variable;

export const metadata: Metadata = {
  title: "DSGT",
  description: "Georgia Tech Data Science Organization",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSansVar} ${geistMonoVar}`}>
      <body suppressHydrationWarning className="antialiased bg-black text-yellow-400">
        {children}
      </body>
    </html>
  );
}
