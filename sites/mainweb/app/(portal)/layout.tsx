// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = "force-dynamic";
export const revalidate = 0; // Disable ISR for authenticated pages

import { preload } from "react-dom";
import { Providers } from "./providers";
import "./fonts.generated.css";
import "./liquid-glass.css";
import PortalWrapper from "@/components/portal/PortalWrapper";
import { FONT_PRELOADS } from "@/lib/fonts.generated";

// Headlines in a newspaper serif, everything else in a grotesque with a voice.
// Both from scripts/subset-fonts.py, which says when to rerun it. The generated
// stylesheet sets their variables on :root, so modals portaled to <body>
// resolve the font roles in liquid-glass.css too.

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  FONT_PRELOADS.portal.forEach((href) =>
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "" }),
  );

  return (
    <Providers>
      <div className="portal-type">
        <PortalWrapper>{children}</PortalWrapper>
      </div>
    </Providers>
  );
}
