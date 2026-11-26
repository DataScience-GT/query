import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, discordLoginEnabled } from "@query/auth";
import { appRouter, createContext } from "@query/api";
import { safeCallback } from "@/lib/safe-callback";
import { pageDek, pageTitle } from "@query/ui/classes";
import LoginActions from "./LoginActions";

export const metadata = { title: "Sign in" };

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

  const inAppBrowser = IN_APP_BROWSER.test(
    (await headers()).get("user-agent") ?? "",
  );

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center px-5 sm:px-8 md:px-12">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 py-10 lg:py-14 items-center">
        <div>
          <h1 className={pageTitle}>Sign in</h1>
          <p className={pageDek}>
            The portal for Data Science at Georgia Tech, for members, hackers,
            judges and volunteers. No membership is needed to apply to a
            hackathon.
          </p>
        </div>

        <LoginActions
          callbackUrl={callbackUrl}
          discord={discordLoginEnabled()}
          inAppBrowser={inAppBrowser}
        />
      </div>
    </main>
  );
}
