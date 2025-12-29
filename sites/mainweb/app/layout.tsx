// app/layout.tsx
import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font";
import "./globals.css";

const geistSansVar = GeistSans.variable;
const geistMonoVar = GeistMono.variable;

export const metadata: Metadata = {
  title: "DSGT | Georgia Tech",
  description: "The largest student-run data science organization at Georgia Tech.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSansVar} ${geistMonoVar}`}>
      {/* FIX: Removed text-yellow-400.
          Changed to text-gray-400 to match your site's gray/teal theme.
          This prevents icons and images from inheriting an unwanted tint.
      */}
      <body suppressHydrationWarning className="antialiased bg-[#050505] text-gray-400">
        {children}
      </body>
    </html>
  );
}