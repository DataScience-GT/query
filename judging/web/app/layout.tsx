import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Panel",
  description: "Hackathon judging",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f6f5f2",
          color: "#1c1917",
        }}
      >
        {children}
      </body>
    </html>
  );
}
