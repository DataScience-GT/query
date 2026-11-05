"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import {
  hackathonNextStep,
  nextStepQueries,
  projectSubmitted,
} from "@/lib/hackathon-next-step";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { body, btnPrimary, meta, textLink } from "@/components/portal/ui";
import { hlSectionTitle } from "./styles";

type Upcoming = NonNullable<RouterOutputs["hackathon"]["getUpcoming"]>;

/**
 * A signed-in visitor who already registered for this edition gets their
 * status and next step instead of the call to action in `children`.
 *
 * The next step is worked out against the viewer's own clock and reads up to
 * four more queries depending on the registration, so it stays in the browser.
 * The page mounts this only for a signed-in visitor and renders `children`
 * itself otherwise, which is also what shows while the registration loads.
 */
export function MyRegistration({
  event,
  children,
}: {
  event: Upcoming;
  children: ReactNode;
}) {
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery();
  // oxlint-disable-next-line react/purity
  const now = new Date();
  const myReg = myRegs?.find((r) => r.hackathonId === event.id);
  // The rest of the step is read only when it can change the answer: the
  // submission and judging for a checked-in hacker while the event runs,
  // results for an admitted one once it has begun.
  const needs = myReg
    ? nextStepQueries({
        now,
        hackathon: event,
        registrationStatus: myReg.registrationStatus,
      })
    : { submission: false, judging: false, results: false };
  const submissionWindow = trpc.team.submissionWindow.useQuery(
    { hackathonId: event.id },
    { enabled: needs.submission },
  );
  const mySubmission = trpc.team.mySubmission.useQuery(
    { hackathonId: event.id },
    { enabled: needs.submission },
  );
  const itinerary = trpc.judging.hacker.itinerary.useQuery(
    { hackathonId: event.id },
    { enabled: needs.judging },
  );
  const results = trpc.hackathon.getResults.useQuery(
    { hackathonId: event.id },
    { enabled: needs.results },
  );
  const stepLoading =
    submissionWindow.isLoading ||
    mySubmission.isLoading ||
    itinerary.isLoading ||
    results.isLoading;
  const nextStep =
    myReg && !stepLoading
      ? hackathonNextStep({
          now,
          hackathon: event,
          registrationStatus: myReg.registrationStatus,
          hasTeam: !!myReg.teamId,
          submissionWindow: submissionWindow.data,
          submitted: projectSubmitted(mySubmission.data),
          itinerary: itinerary.data,
          resultsPublished: (results.data?.length ?? 0) > 0,
        })
      : null;

  if (!myReg) return children;

  return (
    <div className="space-y-4">
      <h2 className={hlSectionTitle}>Your registration</h2>
      <p className={body}>
        Your status: <StatusBadge status={myReg.registrationStatus} />
      </p>
      {nextStep &&
        (nextStep.step === "status" ? (
          nextStep.detail && <p className={body}>{nextStep.detail}</p>
        ) : (
          <p className={body}>
            Next step:{" "}
            <Link href={nextStep.href} className={textLink}>
              {nextStep.label}
            </Link>
            {nextStep.detail && (
              <span className={`mt-1 block ${meta}`}>{nextStep.detail}</span>
            )}
          </p>
        ))}
      <Link
        href={`/hackathons/${hackathonSlug(event.name)}`}
        className={`w-full sm:w-auto ${btnPrimary}`}
      >
        Open my Hacklytics
      </Link>
    </div>
  );
}
