// app/layout.tsx
import type { Metadata } from "next";
import { STIX_Two_Text, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const siteOrigin =
  process.env.AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  "http://localhost:3001";

const display = STIX_Two_Text({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-stix",
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  // Without this, every relative OG image resolves against nothing and social
  // cards render blank.
  metadataBase: new URL(siteOrigin),
  title: {
    default: "DSGT | Georgia Tech",
    // Pages set their own; this keeps the organisation attached to each.
    template: "%s | DSGT",
  },
  description:
    "The largest student-run data science organization at Georgia Tech. Home of Hacklytics, our annual data science hackathon.",
  applicationName: "Data Science @ Georgia Tech",
  keywords: [
    "Hacklytics",
    "data science hackathon",
    "Georgia Tech hackathon",
    "student hackathon",
    "DSGT",
    "Data Science at Georgia Tech",
  ],
  authors: [{ name: "aamoghS" }],
  alternates: { canonical: "/" },
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
    url: siteOrigin,
    siteName: "Data Science @ Georgia Tech",
    title: "Data Science @ Georgia Tech",
    description:
      "The largest student-run data science organization at Georgia Tech. Home of Hacklytics.",
    images: [{ url: "/logo512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "Data Science @ Georgia Tech",
    description:
      "The largest student-run data science organization at Georgia Tech. Home of Hacklytics.",
    images: ["/logo512.png"],
  },
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
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased bg-[#050505] text-gray-400">
        {/* Identifies the publisher behind every page, which is what a crawler
            needs before it will attribute an event to an organisation. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Data Science @ Georgia Tech",
              alternateName: ["DSGT", "Data Science at Georgia Tech"],
              url: siteOrigin,
              logo: `${siteOrigin}/logo512.png`,
              description:
                "The largest student-run data science organization at Georgia Tech.",
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
