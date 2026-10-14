"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { loginHref } from "@/lib/safe-callback";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { HackathonUnavailable } from "@/components/hackathon/HackathonUnavailable";
import { CheckInCodeForm } from "@/components/hackathon/points/CheckInCodeForm";
import { pointsLabel } from "@/components/hackathon/points/format";
import {
  btnPrimary,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionRule,
  textLink,
} from "@/components/portal/ui";

/**
 * Where an event's poster QR lands: /hackathons/<id>/checkin?code=XXXXXX.
 * The code is submitted as soon as the hacker is signed in, so scanning the
 * poster is the whole check-in. Signed-out visitors go to sign in and come
 * back to this same URL, code included.
 */
export default function EventCodeCheckInPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading check-in…" />}>
      <EventCodeCheckIn />
    </Suspense>
  );
}

function EventCodeCheckIn() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const rawId = params.id;
  const hackathonParam = decodeHackathonParam(
    Array.isArray(rawId) ? (rawId[0] ?? "") : ((rawId as string | undefined) ?? ""),
  );
  const code = searchParams.get("code")?.trim() ?? "";

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  const hackathon = trpc.hackathon.getById.useQuery(
    { id: hackathonParam },
    { enabled: authStatus === "authenticated" },
  );

  // From the poster's code, or from one typed after it was refused.
  const [checkedIn, setCheckedIn] = useState<
    RouterOutputs["points"]["me"]["checkIn"] | null
  >(null);

  const utils = trpc.useUtils();
  const checkIn = trpc.points.me.checkIn.useMutation({
    onSuccess: (result) => {
      setCheckedIn(result);
      void utils.points.me.invalidate();
    },
  });
  const { mutate: submitCode } = checkIn;

  // Once per visit. Strict Mode runs effects twice on mount, and a second
  // submit would come back as "already checked in" over the real answer.
  const submitted = useRef(false);
  const hackathonId = hackathon.data?.id;
  useEffect(() => {
    if (!hackathonId || !code || submitted.current) return;
    submitted.current = true;
    submitCode({ hackathonId, code });
  }, [hackathonId, code, submitCode]);

  // FORBIDDEN is also an event not taking codes or outside its window, for a
  // hacker who has arrived. Only one who has not is sent to their pass.
  const refusedForbidden = checkIn.error?.data?.code === "FORBIDDEN";
  const arrival = trpc.points.me.summary.useQuery(
    { hackathonId: hackathonId ?? "" },
    { enabled: !!hackathonId && refusedForbidden },
  );

  if (authStatus !== "authenticated") {
    return <LoadingScreen message="Loading check-in…" />;
  }
  if (hackathon.isLoading) {
    return <LoadingScreen message="Loading check-in…" />;
  }
  if (!hackathon.data) {
    return <HackathonUnavailable message={hackathon.error?.message} />;
  }

  const pointsHref = `/hackathons/${hackathon.data.id}?tab=POINTS`;

  // Opened without a code (or with the code stripped by a QR reader): ask for
  // it rather than calling that an error.
  if (!code && !checkedIn) {
    return (
      <main className={page}>
        <p className={meta}>{hackathon.data.name}</p>
        <h1 className={`mt-2 ${pageTitle}`}>Check in to an event</h1>
        <p className={pageDek}>
          Type the code shown on the screen or poster at the event.
        </p>
        <div className="mt-8 max-w-xl">
          <CheckInCodeForm
            hackathonId={hackathon.data.id}
            onCheckedIn={setCheckedIn}
          />
        </div>
        <div className="mt-6">
          <Link href={pointsHref} className={`min-h-11 ${textLink}`}>
            Your points
          </Link>
        </div>
      </main>
    );
  }

  if (checkedIn) {
    return (
      <main className={page}>
        <p className={meta}>{hackathon.data.name}</p>
        <h1 className={`mt-2 ${pageTitle}`}>
          You&apos;re checked into {checkedIn.eventName}
        </h1>
        <p className={pageDek}>
          {checkedIn.pointsAwarded > 0
            ? `${pointsLabel(checkedIn.pointsAwarded)} added to your total.`
            : "Your attendance is recorded. This event does not award points."}
        </p>
        <Link
          href={pointsHref}
          className={`mt-8 min-h-11 w-full sm:w-auto ${btnPrimary}`}
        >
          See your points
        </Link>
      </main>
    );
  }

  if (checkIn.error) {
    const refusal = checkIn.error.data?.code;
    // Already in, or locked out for a minute: typing another code here does
    // not help, so the form is only offered for the other refusals. Nor for a
    // hacker who has not arrived yet, where the way forward is the pass.
    const notArrived =
      refusal === "FORBIDDEN" && arrival.data?.checkedIn === false;
    const offerForm =
      refusal !== "CONFLICT" &&
      refusal !== "TOO_MANY_REQUESTS" &&
      !notArrived &&
      !(refusal === "FORBIDDEN" && arrival.isLoading);
    return (
      <main className={page}>
        <p className={meta}>{hackathon.data.name}</p>
        <h1 className={`mt-2 ${pageTitle}`}>
          {refusal === "CONFLICT"
            ? "Already checked in"
            : refusal === "TOO_MANY_REQUESTS"
              ? "Too many tries"
              : notArrived
                ? "Check in at the door first"
                : "Not checked in"}
        </h1>
        <p className={pageDek}>
          {notArrived
            ? "Event codes work once your pass has been scanned at check-in."
            : trpcErrorMessage(
                checkIn.error,
                "The check-in did not go through. Type the code from the screen below.",
              )}
        </p>
        {offerForm && (
          <section className={`mt-10 max-w-xl ${sectionRule}`}>
            <CheckInCodeForm
              hackathonId={hackathon.data.id}
              onCheckedIn={setCheckedIn}
            />
          </section>
        )}
        {notArrived && (
          <Link
            href={`/hackathons/${hackathon.data.id}?tab=SCHEDULE`}
            className={`mt-8 min-h-11 w-full sm:w-auto ${btnPrimary}`}
          >
            Show my pass
          </Link>
        )}
        {!notArrived && (
          <div className="mt-6">
            <Link href={pointsHref} className={`min-h-11 ${textLink}`}>
              Your points
            </Link>
          </div>
        )}
      </main>
    );
  }

  return <LoadingScreen message="Checking you in…" />;
}
