import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Silkscreen } from "next/font/google";
import Navbar from "../components/Navbar";
import ServiceWorkerRegistrar from "../components/ServiceWorkerRegistrar";
import Footer from "../components/Footer";
import { INTEREST_URL } from "../lib/links";

// Display face: hero and section titles, set at 800. Variable, with the
// optical-size axis so the big sizes get the display cut.
// Text and UI.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});

// Pixel face, for the small kickers only.
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-silkscreen",
});

export const viewport: Viewport = {
  themeColor: "#131715",
};

export const metadata: Metadata = {
  title: "Hacklytics 2027: Digital Bloom · Data Science Hackathon at Georgia Tech",
  description:
    "Hacklytics 2027 is a free, 36-hour data science and AI hackathon run by Data Science @ GT at Georgia Tech in Atlanta, February 26–28, 2027.",
  keywords: ["hackathon", "data science", "machine learning", "AI", "Georgia Tech", "Atlanta", "coding", "competition"],
  authors: [{ name: "Data Science @ GT" }],
  openGraph: {
    title: "Hacklytics 2027: Digital Bloom",
    description: "A 36-hour data science and AI hackathon at Georgia Tech. Room for 1,000+ hackers in Atlanta.",
    url: "https://hacklytics.io",
    siteName: "Hacklytics",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Hacklytics 2027 Digital Bloom",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hacklytics 2027: Digital Bloom",
    description: "A 36-hour data science and AI hackathon at Georgia Tech.",
    images: ["/og-image.jpg"],
    creator: "@datasciencegt",
  },
  icons: { icon: "/favicon.ico" },
  metadataBase: new URL("https://hacklytics.io"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // JSON-LD structured data for SEO Event Schema
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Hacklytics 2027: Digital Bloom",
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
      "https://hacklytics.io/og-image.jpg"
    ],
    description: "Data Science @ GT runs the Southeast’s data science hackathon: 36 hours of data science and AI at Georgia Tech.",
    offers: {
      "@type": "Offer",
      url: INTEREST_URL,
      price: "0",
      priceCurrency: "USD",
      // PreOrder, not InStock: registration has not opened, and the link behind
      // this offer joins an interest list rather than securing a place. Search
      // results that promise "register now" against a page that cannot are the
      // kind of thing that gets rich results pulled.
      availability: "https://schema.org/PreOrder",
      validFrom: "2026-08-01T00:00:00-04:00"
    },
    organizer: {
      "@type": "Organization",
      name: "Data Science @ GT",
      url: "https://datasciencegt.org"
    }
  };

  return (
    // Font variables go on <html>, not <body>: the theme tokens in
    // globals.css (--font-display etc.) are declared on :root and resolve there.
    <html
      lang="en"
      className={`${instrumentSans.variable} ${silkscreen.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className="font-sans antialiased"
        suppressHydrationWarning
      >
        <Navbar />
        {children}
        <Footer />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
