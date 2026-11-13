// app/layout.tsx
import type { Metadata } from "next";
import { preload } from "react-dom";
import {
  ORG_NAME,
  ORG_NAME_SPOKEN,
  ORG_TAGLINE,
  SITE_ORIGIN,
} from "@query/db/constants";
import "./fonts.generated.css";
import "./globals.css";
import { FONT_PRELOADS } from "@/lib/fonts.generated";

// Geist comes from scripts/subset-fonts.py, which says when to rerun it.

export const metadata: Metadata = {
  // Without this, every relative OG image resolves against nothing and social
  // cards render blank.
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "DSGT | Georgia Tech",
    // Pages set their own; this keeps the organisation attached to each.
    template: "%s | DSGT",
  },
  description:
    `${ORG_TAGLINE} Home of Hacklytics, our annual data science hackathon.`,
  applicationName: ORG_NAME,
  keywords: [
    "Hacklytics",
    "data science hackathon",
    "Georgia Tech hackathon",
    "student hackathon",
    "DSGT",
    ORG_NAME_SPOKEN,
  ],
  authors: [{ name: "aamoghS" }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google use full-length previews and large image thumbnails rather
      // than the truncated defaults.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_ORIGIN,
    siteName: ORG_NAME,
    title: ORG_NAME,
    description:
      `${ORG_TAGLINE} Home of Hacklytics.`,
    images: [{ url: "/logo512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: ORG_NAME,
    description:
      `${ORG_TAGLINE} Home of Hacklytics.`,
    images: ["/logo512.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // preload(), not a <link>: Next and React each emit a <link> in <head>.
  FONT_PRELOADS.root.forEach((href) =>
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "" }),
  );

  return (
    // suppressHydrationWarning on <html>: next-themes writes the theme class
    // here before hydration, so the server markup never matches.
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-[#050505] text-gray-400">
        {/* Identifies the publisher behind every page, which is what a crawler
            needs before it will attribute an event to an organisation. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: ORG_NAME,
              alternateName: ["DSGT", ORG_NAME_SPOKEN],
              url: SITE_ORIGIN,
              logo: `${SITE_ORIGIN}/logo512.png`,
              description:
                ORG_TAGLINE,
              parentOrganization: {
                "@type": "CollegeOrUniversity",
                name: "Georgia Institute of Technology",
                url: "https://www.gatech.edu",
              },
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
