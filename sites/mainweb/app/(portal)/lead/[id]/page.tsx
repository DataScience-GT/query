"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  ApplicationChip,
  InitiativeChip,
  initiativeState,
  seatLabel,
} from "@/components/portal/initiatives/chips";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@query/api";
import type { ApplicationStatus } from "@query/db";

type Applicant = RouterOutputs["initiative"]["getById"]["applicants"][number];

function ApplicantRow({
  initiativeId,
  applicant,
  full,
}: {
  initiativeId: string;
  applicant: Applicant;
  full: boolean;
}) {
  const utils = trpc.useUtils();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const decide = trpc.initiative.decide.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.initiative.getById.invalidate({ id: initiativeId }),
        // The list row carries the pending count, so leaving it alone keeps
        // offering a queue that is already empty.
        utils.initiative.listMine.invalidate(),
      ]);
    },
  });

  const send = (decision: "accepted" | "rejected") =>
    decide.mutate({ initiativeId, userId: applicant.userId, decision });

  return (
    <LiquidGlass className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">
              {applicant.name ?? applicant.email}
            </p>
            <ApplicationChip status={applicant.status} side="leader" />
          </div>
          <p className="mt-0.5 text-sm text-white/50">
            <a href={`mailto:${applicant.email}`} className="hover:text-white">
              {applicant.email}
            </a>
          </p>
          {applicant.pitch && (
            <p className="mt-2 whitespace-pre-line border-l-2 border-white/10 pl-3 text-sm text-white/80">
              {applicant.pitch}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {applicant.status === "pending" && (
            <>
              <button
                type="button"
                disabled={decide.isPending || full}
                onClick={() => send("accepted")}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => send("rejected")}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-40"
              >
                Reject
              </button>
            </>
          )}

          {applicant.status === "rejected" && (
            <button
              type="button"
              disabled={decide.isPending || full}
              onClick={() => send("accepted")}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-40"
            >
              Accept after all
            </button>
          )}

          {applicant.status === "accepted" &&
            (confirmRemove ? (
              <>
                <span className="text-sm text-white/60">Take them off?</span>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => {
                    send("rejected");
                    setConfirmRemove(false);
                  }}
                  className="rounded-full bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/30"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-sm font-semibold text-white/50 transition hover:text-red-300"
              >
                Remove
              </button>
            ))}
        </div>
      </div>

      {decide.error && (
        <p className="mt-3 text-sm text-red-300">{decide.error.message}</p>
      )}
    </LiquidGlass>
  );
}

function Group({
  title,
  rows,
  render,
}: {
  title: string;
  rows: Applicant[];
  render: (applicant: Applicant) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-white/50">
        {title}
        <span>{rows.length}</span>
      </h2>
      <div className="space-y-3">{rows.map(render)}</div>
    </section>
  );
}

export default function LeadInitiativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const detail = trpc.initiative.getById.useQuery({ id });

  if (detail.isPending) return <LoadingScreen />;

  if (detail.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <LiquidGlass className="p-8 text-center">
          <p className="font-semibold text-white">{detail.error.message}</p>
          <Link
            href="/lead"
            className="mt-4 inline-block text-sm font-semibold text-white underline"
          >
            Back to your projects
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  const { initiative, applicants, accepted } = detail.data;
  const state = initiativeState(initiative);
  const full =
    initiative.maxMembers !== null && accepted >= initiative.maxMembers;

  const inState = (...wanted: ApplicationStatus[]) =>
    applicants.filter((row) => wanted.includes(row.status));

  const row = (applicant: Applicant) => (
    <ApplicantRow
      key={applicant.userId}
      initiativeId={initiative.id}
      applicant={applicant}
      full={full}
    />
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/lead"
        className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-white/60 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> Back to your projects
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">{initiative.title}</h1>
        <InitiativeChip state={state} />
      </div>
      <p className="mt-2 text-white/60">
        {seatLabel(accepted, initiative.maxMembers)}
        {initiative.commitment ? ` · ${initiative.commitment}` : ""}
      </p>

      {/* Said once, at the top: every Accept below is off and the reason has to
          be readable without hovering a disabled button. */}
      {full && (
        <p className="mt-3 text-sm text-white/60">
          Every spot is taken. Raise the team size, or remove somebody, before
          accepting anyone else.
        </p>
      )}

      {state === "draft" && (
        <p className="mt-3 text-sm text-white/60">
          This is still a draft, so members cannot see it or apply. Open it from
          your projects list.
        </p>
      )}

      {applicants.length === 0 ? (
        <LiquidGlass className="mt-8 p-8 text-center">
          <p className="font-semibold text-white">Nobody has applied yet.</p>
          <p className="mt-2 text-sm text-white/60">
            {state === "open"
              ? "It is open, so it is showing on the members' projects page."
              : "Open it from your projects list and it will start showing to members."}
          </p>
        </LiquidGlass>
      ) : (
        <>
          <Group
            title="Waiting on you"
            rows={inState("pending")}
            render={row}
          />
          <Group title="On the team" rows={inState("accepted")} render={row} />
          <Group
            title="Turned down and withdrawn"
            rows={inState("rejected", "withdrawn")}
            render={row}
          />
        </>
      )}
    </div>
  );
}
