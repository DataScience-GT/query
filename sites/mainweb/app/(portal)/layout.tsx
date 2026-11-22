// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = "force-dynamic";
export const revalidate = 0; // Disable ISR for authenticated pages

import { Providers } from "./providers";
import { loadPortalBootstrap } from "@/lib/portal-bootstrap.server";
import "@query/ui/portal.css";
import "./liquid-glass.css";
import PortalWrapper from "@/components/portal/PortalWrapper";
import { portalSidebarSections } from "@/components/portal/portal-sidebar-sections";
import { RetryPortalNav } from "@/components/portal/RetryPortalNav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, state, portal, registrations, navFailed } =
    await loadPortalBootstrap();

  return (
    <Providers session={session} state={state}>
      <div className="portal-type">
        {navFailed && <RetryPortalNav />}
        <PortalWrapper sections={portalSidebarSections(portal, registrations)}>
          {children}
        </PortalWrapper>
      </div>
    </Providers>
  );
}
