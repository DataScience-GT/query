import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@query/auth";
import { appRouter, createContext } from "@query/api";
import { safeCallback } from "@/lib/safe-callback";
import { mastRule, pageDek, pageTitle } from "@/components/portal/ui";
import LoginActions from "./LoginActions";

/**
 * In-app browsers (Instagram, Facebook, TikTok, Line) that Google refuses to
 * sign anybody into: its OAuth page rejects embedded webviews with
 * "disallowed_useragent". Hackers arrive from social links, so the page has to
 * say so before they tap a button that cannot work.
 */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|TikTok|musical_ly|Line\//;

/**
 * Where a signed-in visitor with no destination of their own belongs. Judges
 * who are not staff go to the judging page. A failed lookup falls through to
 * the dashboard rather than leaving the visitor stuck here.
 */
async function roleHome() {
  try {
    const portal = await appRouter
      .createCaller(await createContext())
      .user.getPortalContext();
    return portal.isJudge && !portal.isAdmin ? "/judge" : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl: rawCallback } = await searchParams;
  const callbackUrl = safeCallback(
    Array.isArray(rawCallback) ? rawCallback[0] : rawCallback,
  );

  // An explicit destination wins over the role default: somebody sent here by
  // a page that asked them to sign in wants to land back on it, not on a
  // dashboard that says nothing about why they signed in.
  const session = await auth();
  if (session?.user) redirect(callbackUrl ?? (await roleHome()));

  // Hackers come from /hacklytics or /hackathons and need no membership, so
  // the member-portal framing would tell them they are in the wrong place.
  const forHacklytics = !!callbackUrl && callbackUrl.startsWith("/hacklytics");
  const forHackers =
    forHacklytics || (!!callbackUrl && callbackUrl.startsWith("/hackathons"));
  const inAppBrowser = IN_APP_BROWSER.test(
    (await headers()).get("user-agent") ?? "",
  );

  return (
    <main className="min-h-screen flex items-center px-5 sm:px-8 md:px-12">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 py-10 lg:py-14 items-center">
        <div>
          <div className={`flex items-center justify-between gap-4 ${mastRule}`}>
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/images/dsgt/apple-touch-icon.png"
                alt=""
                className="h-8 w-8 shrink-0 object-contain"
              />
              <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                DS@GT
              </p>
            </div>
            {forHackers && (
              <p className="shrink-0 text-[13px] text-[var(--text-muted)]">
                For hackers
              </p>
            )}
          </div>
          <h1 className={`mt-10 ${pageTitle}`}>
            {forHacklytics ? "Hacklytics" : forHackers ? "Hackathons" : "Query"}
            <span className="text-accent">.</span>
          </h1>
          <p className={pageDek}>
            {forHackers
              ? `Sign in to apply${forHacklytics ? " to Hacklytics" : ""}. No membership needed; any email works.`
              : "The portal for Data Science at Georgia Tech members, judges and volunteers."}
          </p>
        </div>

        <LoginActions
          callbackUrl={callbackUrl}
          forHackers={forHackers}
          inAppBrowser={inAppBrowser}
        />
      </div>
    </main>
  );
}
