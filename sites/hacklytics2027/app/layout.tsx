import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Navbar from "../components/Navbar";
import ServiceWorkerRegistrar from "../components/ServiceWorkerRegistrar";
import Footer from "../components/Footer";

// Self-hosted so the build never depends on reaching Google Fonts.
// Latin woff2 subsets pulled from Google Fonts; both faces are OFL.
const archivo = localFont({
  src: [{ path: "./fonts/Archivo-100900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const viewport: Viewport = {
  themeColor: "#f2efe9",
};

export const metadata: Metadata = {
  title: "Hacklytics 2027 | Data Science @ Georgia Tech",
  description:
    "Hacklytics 2027 — 36 hours of data science and AI at Georgia Tech. Feb 26–28, 2027, Klaus Advanced Computing Building, Atlanta. Free to enter, 1,000+ hackers.",
  keywords: ["hackathon", "data science", "machine learning", "AI", "Georgia Tech", "Atlanta", "coding", "competition"],
  authors: [{ name: "Data Science @ GT" }],
  openGraph: {
    title: "Hacklytics 2027",
    description: "36 hours. 1,000 hackers. Feb 26–28, 2027 at Georgia Tech.",
    url: "https://hacklytics.io",
    siteName: "Hacklytics",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hacklytics 2027 — Feb 26–28, Georgia Tech",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hacklytics 2027",
    description: "The premier data science hackathon at Georgia Tech.",
    images: ["/og-image.png"],
    creator: "@datasciencegt",
  },
  metadataBase: new URL("https://hacklytics.io"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // JSON-LD structured data for SEO Event Schema
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Hacklytics 2027",
    startDate: "2027-02-26T17:00:00-05:00",
    endDate: "2027-02-28T16:00:00-05:00",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: "Klaus Advanced Computing Building",
      address: {
        "@type": "PostalAddress",
        streetAddress: "266 Ferst Dr NW",
        addressLocality: "Atlanta",
        postalCode: "30332",
        addressRegion: "GA",
        addressCountry: "US"
      }
    },
    image: [
      "https://hacklytics.io/og-image.png"
    ],
    description: "Data Science @ GT — The premier data science hackathon in the Southeast. 36 hours of coding, data science, and AI.",
    offers: {
      "@type": "Offer",
      url: "https://form.typeform.com/to/GvqBCdAe",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      validFrom: "2026-08-01T00:00:00-04:00"
    },
    organizer: {
      "@type": "Organization",
      name: "Data Science @ GT",
      url: "https://datasciencegt.org"
    }
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${archivo.variable} ${plexMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <a
          href="#about"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-paper mono-label"
        >
          Skip to content
        </a>
        <Navbar />
        {children}
        <Footer />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
