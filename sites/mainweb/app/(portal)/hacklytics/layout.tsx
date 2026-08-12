import type { Metadata } from "next";

// The page itself is a client component and cannot export metadata, so the
// funnel's link preview lives here. Without it a shared link inherits the root
// "DSGT | Georgia Tech" title and shows no image.
export const metadata: Metadata = {
  title: "Hacklytics: Digital Bloom | Feb 26–28, 2027",
  description:
    "Georgia Tech's premier data science hackathon. Join the interest list and we'll email you the moment registration opens.",
  openGraph: {
    title: "Hacklytics: Digital Bloom",
    description:
      "Feb 26–28, 2027 at Georgia Tech. Join the interest list and we'll email you the moment registration opens.",
    url: "https://datasciencegt.org/hacklytics",
    siteName: "Data Science @ Georgia Tech",
    images: [{ url: "/logo512.png", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Hacklytics: Digital Bloom",
    description:
      "Feb 26–28, 2027 at Georgia Tech. Join the interest list for registration news.",
    images: ["/logo512.png"],
  },
};

export default function HacklyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
