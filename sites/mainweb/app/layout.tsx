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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning on <html>: next-themes writes the theme class
    // here before hydration, so the server markup never matches.
    <html
      lang="en"
      className={`${geistSansVar} ${geistMonoVar}`}
      suppressHydrationWarning
    >
      <body className="antialiased bg-[#050505] text-gray-400">
        {children}
      </body>
    </html>
  );
}
