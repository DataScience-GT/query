// app/layout.tsx
import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font";
import "./globals.css";

const geistSansVar = GeistSans.variable;
const geistMonoVar = GeistMono.variable;

export const metadata: Metadata = {
  title: "DSGT Portal",
  description: "Georgia Tech Data Science Organization",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${geistSansVar} ${geistMonoVar}`}>
      <body className="antialiased bg-[#0F111A] text-white">
        {children}
      </body>
    </html>
  );
}
