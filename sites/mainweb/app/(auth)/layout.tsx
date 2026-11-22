// force-dynamic required: the session is read per request and seeds SessionProvider
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Image from "next/image";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { AppThemeProvider } from "@/components/portal/AppThemeProvider";
import { loadPortalSession } from "@/lib/portal-bootstrap.server";
import logo from "@/assets/images/dsgt/apple-touch-icon.png";
import "@query/ui/portal.css";
import "../(portal)/liquid-glass.css";

// Sign-in screens for visitors with no account yet, and the two dead ends a
// signed-out visitor can land on (a failed sign-in and a dead room QR code,
// at /auth/error and /judge/guest/invalid-link). They look like the portal
// (same theme ramp and page ground) but use none of its data stack, so
// they sit in a sibling group that mounts the theme and the session and leaves
// out tRPC, react-query and the sidebar. Sibling groups share the root layout,
// so a client navigation between this group and (portal) is not a full reload.

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await loadPortalSession();

  return (
    <AppThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SessionProvider basePath="/api/auth" session={session}>
        <div className="portal-type">
          <div className="bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen">
            <header className="flex h-16 items-center justify-between px-5 sm:px-8 md:px-12">
              <Link href="/" className="group flex items-center gap-2.5">
                <Image
                  src={logo}
                  alt=""
                  className="h-7 w-7 transition-transform duration-500 group-hover:rotate-[360deg]"
                  width={28}
                  height={28}
                />
                <span className="text-xl font-bold leading-none tracking-tighter">
                  DS@GT
                </span>
              </Link>
              <Link
                href="/"
                className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                Back to site
              </Link>
            </header>
            {children}
          </div>
        </div>
      </SessionProvider>
    </AppThemeProvider>
  );
}
