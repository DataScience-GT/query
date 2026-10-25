// Who may take part (admitted, checked in) and which project row a participant owns.

import { TRPCError } from "@trpc/server";
import { hackathonProjects } from "@query/db";
import { eq, and, isNull } from "drizzle-orm";
import type { Tx } from "./windows";

// The single project row a participant owns: their team's entry, or the solo
// entry they filed. Shared by submitProject and mySubmission so the form is
// prefilled from exactly the row a resubmit updates — two copies of this rule
// drifting apart is how a resubmit files a duplicate instead of an edit.
export function ownProjectWhere(
  hackathonId: string,
  teamId: string | null | undefined,
  participantId: string,
) {
  return and(
    eq(hackathonProjects.hackathonId, hackathonId),
    teamId
      ? eq(hackathonProjects.teamId, teamId)
      : and(
          isNull(hackathonProjects.teamId),
          eq(hackathonProjects.submittedById, participantId),
        ),
  );
}

// Only admitted applicants take part. This used to block `rejected` and
// `waitlisted` alone, and every participant starts `pending` — so teams
// formed and projects were submitted with no review at all while organisers
// were shown an approve/reject screen that decided only an email.
// `checked_in` counts: a scanned badge at the door is plainly admitted.
const ADMITTED_STATUSES = ["approved", "checked_in"];

export function checkAdmitted(registrationStatus: string) {
  if (ADMITTED_STATUSES.includes(registrationStatus)) return;

  if (registrationStatus === "pending") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Your registration is still being reviewed. You can form a team once you have been accepted.",
    });
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Your registration for this hackathon is ${registrationStatus}.`,
  });
}

// Submitting needs more than acceptance: the person has to be in the
// building. Acceptance is a decision made weeks earlier and says nothing
// about turning up, and the table numbers, printed cards and in-person
// scoring all assume they did.
export function checkCheckedIn(registrationStatus: string) {
  if (registrationStatus === "checked_in") return;

  checkAdmitted(registrationStatus);

  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "You need to check in at the event before submitting. Find a volunteer and have your badge scanned.",
  });
}

// Joining a team after submitting solo orphans the solo row: ownProjectWhere
// then resolves to the team's entry, so the solo one stays `submitted`, stays
// in the gallery, and is promoted into judging with nobody able to withdraw
// it. `draft` is fine — it reaches neither.
export async function assertNoLiveSoloSubmission(
  tx: Tx,
  hackathonId: string,
  participantId: string,
) {
  const solo = await tx.query.hackathonProjects.findFirst({
    where: ownProjectWhere(hackathonId, null, participantId),
    columns: { status: true },
  });

  if (solo && solo.status !== "draft") {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "You already have a solo project submitted. Withdraw it from Submit Project before joining a team.",
    });
  }
}
