"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { useNextStep } from "@/lib/use-next-step";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { body, btnPrimary, meta, textLink } from "@query/ui/classes";
import { hlSectionTitle } from "./styles";

type Upcoming = NonNullable<RouterOutputs["hackathon"]["getUpcoming"]>;

/**
 * A signed-in visitor who already registered for this edition gets their
 * status and next step instead of the call to action in `children`.
 *
 * The next step is worked out against the viewer's own clock and reads up to
 * five more queries depending on the registration, so it stays in the browser.
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
  const { step: nextStep } = useNextStep({
    now,
    hackathon: event,
    registration: myReg,
  });

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
