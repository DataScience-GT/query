import type { ReactNode } from "react";
import Link from "next/link";
import type { VolunteerAnswers, VolunteerStatus } from "@query/db/constants";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  sectionRule,
  status,
  textLink,
} from "@query/ui/classes";
import type { Tone } from "@query/ui/classes";
import { isHacklyticsName } from "@/lib/hackathon-slug";
import { VolunteerSummary } from "./VolunteerSummary";

type Props = {
  hackathon: { name: string; startDate: Date | string };
  application: { status: VolunteerStatus; answers: VolunteerAnswers };
  /** Whether the edition still takes new applications (for applying again). */
  accepting: boolean;
  /** Whether a pending application can still be corrected. */
  canEdit: boolean;
  /** The event page. */
  eventHref: string;
  /** The Discord step, shown to an approved volunteer. */
  discordCard?: ReactNode;
  contactEmail: string;
  busy: boolean;
  onEdit: () => void;
  onWithdraw: () => void;
  onApplyAgain: () => void;
};

const BADGE: Record<VolunteerStatus, { tone: Tone; label: string }> = {
  pending: { tone: "warning", label: "Pending review" },
  approved: { tone: "success", label: "Confirmed" },
  declined: { tone: "neutral", label: "Not placed" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
};

/** Where an application stands, and what the person can do about it. */
export function VolunteerStatusView({
  hackathon,
  application,
  accepting,
  canEdit,
  eventHref,
  discordCard,
  contactEmail,
  busy,
  onEdit,
  onWithdraw,
  onApplyAgain,
}: Props) {
  const { status: current, answers } = application;
  const badge = BADGE[current];
  const discord = isHacklyticsName(hackathon.name)
    ? "the Hacklytics Discord"
    : "the event Discord";
  // What the Discord is for, which depends on how they offered to help.
  const discordFor = {
    in_person: "shifts and changes are shared there",
    online: "hackers' questions come in through its mentor channels",
    both: "shifts, changes and hackers' questions are all there",
  }[answers.mode];
  const contact = (
    <a href={`mailto:${contactEmail}`} className={textLink}>
      {contactEmail}
    </a>
  );

  return (
    <section className={`mt-10 max-w-3xl ${sectionRule}`}>
      <p className={status(badge.tone)}>{badge.label}</p>

      {current === "pending" && (
        <>
          <h2 className={`mt-3 ${itemTitle}`}>Application received</h2>
          <p className={`mt-2 max-w-xl ${body}`}>
            An organizer will review it, and you&apos;ll get an email when it
            is decided.{" "}
            {canEdit
              ? "Until then you can change your answers or withdraw."
              : "It can no longer be edited."}
          </p>
        </>
      )}

      {current === "approved" && (
        <>
          <h2 className={`mt-3 ${itemTitle}`}>
            You&apos;re confirmed as a volunteer
          </h2>
          <p className={`mt-2 max-w-xl ${body}`}>
            Thank you for giving the weekend your time. Two things to do next.
          </p>
          <ol className={`mt-4 max-w-xl list-decimal space-y-2 pl-5 ${body}`}>
            <li>
              Join {discord}. It&apos;s required for volunteers, and{" "}
              {discordFor}. Link your account below.
            </li>
            <li>
              Check the times below. If your plans change, withdraw so
              organizers can plan around you.
            </li>
          </ol>
          {discordCard && <div className="mt-6">{discordCard}</div>}
          <Link href={eventHref} className={`mt-6 ${btnPrimary}`}>
            Open the event page
          </Link>
        </>
      )}

      {current === "declined" && (
        <>
          <h2 className={`mt-3 ${itemTitle}`}>Not placed this time</h2>
          <p className={`mt-2 max-w-xl ${body}`}>
            Thank you for offering. Shifts follow the roles and times the
            weekend needs, so this says little about you. Questions? Email{" "}
            {contact}.
          </p>
        </>
      )}

      {current === "withdrawn" && (
        <>
          <h2 className={`mt-3 ${itemTitle}`}>You withdrew your application</h2>
          <p className={`mt-2 max-w-xl ${body}`}>
            {accepting ? (
              "If your plans changed, you can apply again until the event starts."
            ) : (
              <>
                Applications are closed, so it can&apos;t be reopened.
                Questions? Email {contact}.
              </>
            )}
          </p>
        </>
      )}

      {current !== "declined" && (
        <div className="mt-8">
          <VolunteerSummary
            answers={answers}
            startDate={hackathon.startDate}
          />
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {current === "pending" && canEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className={btnSecondary}
          >
            Edit answers
          </button>
        )}
        {(current === "pending" || current === "approved") && (
          <button
            type="button"
            onClick={onWithdraw}
            disabled={busy}
            className={btnSecondary}
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
        {current === "withdrawn" && accepting && (
          <button type="button" onClick={onApplyAgain} className={btnPrimary}>
            Apply again
          </button>
        )}
      </div>
    </section>
  );
}
