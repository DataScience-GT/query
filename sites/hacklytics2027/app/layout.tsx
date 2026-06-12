// app/layout.tsx - Digital Bloom x Brutalist Theme
import "./globals.css";
import type { Metadata } from "next";
import { Roboto_Mono, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import FloatingFlowers from "../components/FloatingFlowers";
import ServiceWorkerRegistrar from "../components/ServiceWorkerRegistrar";
import Footer from "../components/Footer";

// Techy, Brutalist fonts
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "700", "500"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Hacklytics 2027: Digital Bloom",
  description:
    "Data Science @ GT - The premier data science hackathon in the southeast. Register now for Hacklytics 2027.",
  authors: [{ name: "DSGT" }],
  openGraph: {
    title: "Hacklytics 2027: Digital Bloom",
    description:
      "The premier data science hackathon. 36 hours. Join us in Atlanta.",
    type: "website",
    locale: "en_US",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${robotoMono.variable} ${spaceGrotesk.variable} font-sans`}
        suppressHydrationWarning
      >
        <Navbar />
        <FloatingFlowers count={10} />
        {children}
        <Footer />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
