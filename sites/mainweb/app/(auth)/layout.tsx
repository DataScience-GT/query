// force-dynamic required: the session is read per request and seeds SessionProvider
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { preload } from "react-dom";
import { SessionProvider } from "next-auth/react";
import { AppThemeProvider } from "@/components/portal/AppThemeProvider";
import { loadPortalSession } from "@/lib/portal-bootstrap.server";
import { FONT_PRELOADS } from "@/lib/fonts.generated";
import "../(portal)/fonts.generated.css";
import "@query/ui/portal.css";
import "../(portal)/liquid-glass.css";

// Sign-in screens for visitors with no account yet. They look like the portal
// (same fonts, theme ramp and page ground) but use none of its data stack, so
// they sit in a sibling group that mounts the theme and the session and leaves
// out tRPC, react-query and the sidebar. Sibling groups share the root layout,
// so a client navigation between this group and (portal) is not a full reload.

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  FONT_PRELOADS.portal.forEach((href) =>
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "" }),
  );

  const session = await loadPortalSession();

  return (
    <AppThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <SessionProvider basePath="/api/auth" session={session}>
        <div className="portal-type">
          <div className="bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen flex flex-col md:flex-row">
            <div className="flex-1 w-full transition-[padding] duration-200">
              {children}
            </div>
          </div>
        </div>
      </SessionProvider>
    </AppThemeProvider>
  );
}
