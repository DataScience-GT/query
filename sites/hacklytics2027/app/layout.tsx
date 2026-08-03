import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Roboto_Mono, Space_Grotesk, Silkscreen } from "next/font/google";
import Navbar from "../components/Navbar";
import ServiceWorkerRegistrar from "../components/ServiceWorkerRegistrar";
import Footer from "../components/Footer";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
});

// Pixel face for the Terraria-style flora labels and badges.
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-pixel",
});

export const viewport: Viewport = {
  themeColor: "#050508",
};

export const metadata: Metadata = {
  title: "Hacklytics 2027: Digital Bloom | Premier Data Science Hackathon",
  description:
    "Join Data Science @ GT for Hacklytics 2027, the premier data science and AI hackathon in the Southeast. 36 hours of coding, prizes, and networking in Atlanta.",
  keywords: ["hackathon", "data science", "machine learning", "AI", "Georgia Tech", "Atlanta", "coding", "competition"],
  authors: [{ name: "Data Science @ GT" }],
  openGraph: {
    title: "Hacklytics 2027: Digital Bloom",
    description: "The premier data science hackathon. 36 hours. Join 1,000+ hackers in Atlanta.",
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
    description: "The premier data science hackathon at Georgia Tech.",
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
        className={`${robotoMono.variable} ${spaceGrotesk.variable} ${silkscreen.variable} font-sans antialiased`}
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
