"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { loginHref } from "@/lib/safe-callback";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  body,
  btnPrimary,
  itemTitle,
  kicker,
  label,
  meta,
  object,
  page,
  pageDek,
  pageTitle,
  status,
  textLink,
} from "@/components/portal/ui";

/**
 * Where a claim email lands. Shows which project and which name on its team
 * the link holds, so a forwarded link is caught before anyone confirms, then
 * sends the hacker to the event's Judging tab.
 */
function ClaimContent() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const hackathonId = params?.id ?? "";
  const token = searchParams.get("token")?.trim() ?? "";
  const judgingHref = `/hackathons/${hackathonId}?tab=JUDGING`;
  const [error, setError] = useState<string | null>(null);

  // The link usually arrives on a phone that is not signed in yet; come
  // straight back here, token and all, afterwards.
  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  const preview = trpc.judging.hacker.previewClaim.useQuery(
    { hackathonId, token },
    {
      enabled: authStatus === "authenticated" && !!token,
      // Every refusal here is final until a person acts; retrying only delays it.
      retry: false,
    },
  );

  const claim = trpc.judging.hacker.claimByToken.useMutation({
    onSuccess: async () => {
      await utils.judging.hacker.myClaim.invalidate({ hackathonId });
      router.replace(judgingHref);
    },
    onError: (e) =>
      setError(trpcErrorMessage(e, "The claim did not go through. Try again.")),
  });

  if (authStatus !== "authenticated" || (token && preview.isLoading)) {
    return <LoadingScreen message="Opening your claim link…" />;
  }

  const back = (
    <Link
      href={judgingHref}
      className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
    >
      ← Judging
    </Link>
  );

  if (!token || preview.isError || !preview.data) {
    const code = preview.error?.data?.code;
    const title = !token
      ? "This link is incomplete"
      : code === "FORBIDDEN"
        ? "Check in first"
        : code === "BAD_REQUEST"
          ? "This link no longer works"
          : "This link did not open";
    const message = !token
      ? "The claim code is missing from the address. Open the link from the email again, or ask an organiser at the help desk for a new one."
      : trpcErrorMessage(
          preview.error,
          "Something went wrong opening this link. Try it again in a moment.",
        );

    return (
      <main className={page}>
        {back}
        <div className="mt-6 max-w-xl">
          <h1 className={pageTitle}>{title}</h1>
          <p className={pageDek}>{message}</p>
          <p className={`mt-6 ${body}`}>
            Already claimed your project? It is on your{" "}
            <Link href={judgingHref} className={textLink}>
              Judging tab
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const data = preview.data;

  return (
    <main className={page}>
      {back}
      <div className="mt-6 max-w-xl">
        <p className={kicker}>{data.hackathonName}</p>
        <h1 className={`mt-1 ${pageTitle}`}>Claim your place</h1>
        <p className={pageDek}>
          This link holds the place listed as {data.place.name}. Once it is
          yours, where and when the project presents, and its feedback, show
          on your Judging tab.
        </p>

        <section className={`mt-8 ${object} p-5 sm:p-6`}>
          <p className={label}>Project</p>
          <h2 className={`mt-1 ${itemTitle}`}>{data.title}</h2>
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {data.members.map((member) => {
              const isPlace = member.id === data.place.memberId;
              return (
                <li
                  key={member.id}
                  className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
                >
                  <span
                    className={`min-w-0 truncate text-[15px] ${isPlace ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                  >
                    {member.name}
                  </span>
                  <span
                    className={`shrink-0 ${status(isPlace ? "accent" : member.claimed ? "success" : "neutral")}`}
                  >
                    {isPlace
                      ? "This link"
                      : member.claimed
                        ? "Claimed"
                        : "Not claimed"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {data.refusal ? (
          <div className="mt-6">
            <p
              role="alert"
              className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]"
            >
              {data.refusal}
            </p>
            <Link href={judgingHref} className={`mt-5 ${textLink}`}>
              Open the Judging tab
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            {error && (
              <p
                role="alert"
                className="mb-4 border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={claim.isPending}
              onClick={() => {
                setError(null);
                claim.mutate({ hackathonId, token });
              }}
              className={`min-h-11 w-full sm:w-auto ${btnPrimary}`}
            >
              {claim.isPending ? "Claiming…" : `Claim as ${data.place.name}`}
            </button>
            <p className={`mt-3 ${meta}`}>
              Not {data.place.name}? Leave this place for them and ask an
              organiser at the help desk for your own link.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Opening your claim link…" />}>
      <ClaimContent />
    </Suspense>
  );
}
