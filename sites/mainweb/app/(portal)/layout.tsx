// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = "force-dynamic";
export const revalidate = 0; // Disable ISR for authenticated pages

import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import "./liquid-glass.css";
import PortalWrapper from "@/components/portal/PortalWrapper";

// Headlines in a newspaper serif, everything else in a grotesque with a voice.
// Loaded here rather than by CSS @import so neither blocks first paint.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
});

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      {/* On :root rather than a wrapper class, so modals portaled to <body>
          resolve the font roles in liquid-glass.css too. */}
      <style>{`:root{--font-newsreader:${newsreader.style.fontFamily};--font-schibsted:${schibsted.style.fontFamily};}`}</style>
      <div className="portal-type">
        <PortalWrapper>{children}</PortalWrapper>
      </div>
    </Providers>
  );
}
