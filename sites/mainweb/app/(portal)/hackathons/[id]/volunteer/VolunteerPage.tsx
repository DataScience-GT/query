"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CONTACT_EMAIL } from "@query/core";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { HackathonUnavailable } from "@/components/hackathon/HackathonUnavailable";
import { VolunteerForm } from "@/components/volunteer/VolunteerForm";
import { VolunteerStatusView } from "@/components/volunteer/VolunteerStatusView";
import { Alert } from "@query/ui/Alert";
import { confirmDialog } from "@query/ui/ConfirmDialog";
import {
  body,
  btnSecondary,
  kicker,
  page,
  pageDek,
  pageTitle,
  sectionRule,
  textLink,
  itemTitle,
} from "@query/ui/classes";
import { decodeHackathonParam, isHacklyticsName } from "@/lib/hackathon-slug";
import { volunteerVenue } from "@/lib/volunteer-venue";

const HACKLYTICS_CONTACT = "hello@hacklytics.io";

/**
 * Apply to volunteer at one edition, and follow the application afterwards.
 * Volunteers run the weekend; judging is a different application, and the
 * header says so up front.
 */
export default function VolunteerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const param = decodeHackathonParam(params?.id ?? "");

  const hackathonQuery = trpc.hackathon.getById.useQuery({ id: param });
  const hackathon = hackathonQuery.data;
  const mine = trpc.volunteer.myApplication.useQuery(
    { hackathonId: hackathon?.id ?? "" },
    { enabled: !!hackathon },
  );

  // "form" while someone applies, corrects, or applies again; the status
  // otherwise. An application that does not exist yet shows the form without
  // being asked to.
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");

  const withdraw = trpc.volunteer.withdraw.useMutation({
    onSuccess: () => utils.volunteer.myApplication.invalidate(),
    onError: (e) => setError(trpcErrorMessage(e, "That didn't go through. Try again.")),
  });

  if (hackathonQuery.isLoading || (!!hackathon && mine.isLoading)) {
    return <LoadingScreen message="Loading…" />;
  }
  if (hackathonQuery.error || !hackathon) {
    return <HackathonUnavailable message={hackathonQuery.error?.message} />;
  }
  if (mine.error || !mine.data) {
    return (
      <main className={page}>
        <h1 className={pageTitle}>Your application didn&apos;t load</h1>
        <p className={pageDek}>
          {trpcErrorMessage(mine.error, "Something went wrong reading it.")}
        </p>
        <button
          type="button"
          onClick={() => void mine.refetch()}
          className={`mt-6 ${btnSecondary}`}
        >
          Try again
        </button>
      </main>
    );
  }

  const { application, accepting, canEdit } = mine.data;
  const bloom = isHacklyticsName(hackathon.name);
  const brand = bloom ? "Hacklytics" : hackathon.name;
  const venue = volunteerVenue(hackathon);
  const eventHref = `/hackathons/${param}`;
  const contactEmail = bloom ? HACKLYTICS_CONTACT : CONTACT_EMAIL;
  const judgeHref = `/judge/register?hackathonId=${hackathon.id}`;

  const showForm = formOpen || (!application && accepting);

  const content = (
    <main className={page}>
      <Link
        href={eventHref}
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← {hackathon.name}
      </Link>

      <header className="mt-6">
        <p className={kicker}>Volunteers</p>
        <h1 className={`mt-1 ${pageTitle}`}>Volunteer at {brand}</h1>
        <p className={pageDek}>
          Help in person at {venue} (check-in, meals, rooms, help for hackers)
          or as an online mentor answering hackers&apos; questions. You
          don&apos;t judge projects.
        </p>
        <p className={`mt-2 ${body}`}>
          Looking to judge instead?{" "}
          <Link href={judgeHref} className={textLink}>
            Apply as a judge
          </Link>
          .
        </p>
      </header>

      {error && (
        <Alert rule className="mt-6 max-w-3xl">
          {error}
        </Alert>
      )}

      {showForm ? (
        <VolunteerForm
          hackathon={hackathon}
          saved={application?.answers}
          editing={application?.status === "pending"}
          onDone={() => setFormOpen(false)}
          onCancel={() => (application ? setFormOpen(false) : router.push(eventHref))}
        />
      ) : application ? (
        <VolunteerStatusView
          hackathon={hackathon}
          application={application}
          accepting={accepting}
          canEdit={canEdit}
          eventHref={eventHref}
          contactEmail={contactEmail}
          busy={withdraw.isPending}
          onEdit={() => {
            setError("");
            setFormOpen(true);
          }}
          onApplyAgain={() => {
            setError("");
            setFormOpen(true);
          }}
          onWithdraw={async () => {
            setError("");
            const ok = await confirmDialog({
              title: "Withdraw your application?",
              body: "Organizers will stop counting on you. If applications are still open, you can apply again.",
              confirmLabel: "Withdraw",
              tone: "danger",
            });
            if (ok) withdraw.mutate({ hackathonId: hackathon.id });
          }}
        />
      ) : (
        <section className={`mt-10 max-w-3xl ${sectionRule}`}>
          <h2 className={itemTitle}>Applications are closed</h2>
          <p className={`mt-2 max-w-xl ${body}`}>
            Volunteer applications closed when the event started. Questions?
            Email{" "}
            <a href={`mailto:${contactEmail}`} className={textLink}>
              {contactEmail}
            </a>
            .
          </p>
        </section>
      )}
    </main>
  );

  return bloom ? <div className="hl-theme hl-app">{content}</div> : content;
}
