"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  READ_ONLY_TITLE,
  usePortalContext,
  useReadOnly,
} from "@/lib/use-portal-context";
import { UserPlus, Copy, ChevronDown } from "lucide-react";
import { Alert } from "@query/ui/Alert";
import {
  body,
  btnDanger,
  btnInk,
  btnSecondary,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@query/ui/classes";
import { FormInput } from "@query/ui/FormInput";
import { confirmDialog } from "@query/ui/ConfirmDialog";
import { EmptyState } from "@query/ui/EmptyState";

type StatusFilter = "all" | "waiting" | "approved" | "unanswered";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "waiting", label: "Waiting" },
  { value: "approved", label: "Approved" },
];

// Judges who applied before the in-person question existed, and never answered.
const UNANSWERED: { value: StatusFilter; label: string } = {
  value: "unanswered",
  label: "In person: not answered",
};

type JudgeDetailsProps = {
  judge: {
    id: string;
    phone: string | null;
    company: string | null;
    title: string | null;
    specialty: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    previousExperience: string | null;
    dietaryRestrictions: string[] | null;
    shirtSize: string | null;
    canAttendInPerson: boolean | null;
    whyJudge: string | null;
    createdAt: Date | string;
  };
  email: string | null | undefined;
  track: string | null | undefined;
  isLead: boolean | undefined;
  /** Sets the in-person answer; null puts it back to "not asked". */
  onSetAttendance: (value: boolean | null) => void;
  attendanceLocked: boolean;
};

const safeHref = (value: string) =>
  /^https?:\/\//i.test(value) ? value : null;

/** Everything the judge submitted, so an organizer reads it before approving. */
function JudgeDetails({
  judge,
  email,
  track,
  isLead,
  onSetAttendance,
  attendanceLocked,
}: JudgeDetailsProps) {
  const link = (value: string | null) => {
    if (!value) return null;
    const href = safeHref(value);
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={textLink}
      >
        {value}
      </a>
    ) : (
      value
    );
  };
  const rows: [string, React.ReactNode][] = [
    [
      "Email",
      email ? (
        <a href={`mailto:${email}`} className={textLink}>
          {email}
        </a>
      ) : null,
    ],
    ["Phone", judge.phone],
    ["Company", judge.company],
    ["Title", judge.title],
    ["Expertise", judge.specialty],
    ["Preferred track", track],
    ["Lead judge", isLead ? "Yes" : null],
    ["LinkedIn", link(judge.linkedinUrl)],
    ["GitHub", link(judge.githubUrl)],
    ["Previous judging experience", judge.previousExperience],
    ["Why they want to judge", judge.whyJudge],
    [
      "Dietary restrictions",
      judge.dietaryRestrictions?.length
        ? judge.dietaryRestrictions.join(", ")
        : null,
    ],
    ["Shirt size", judge.shirtSize],
    [
      "Attends in person",
      <span key="attends" className="flex flex-wrap items-center gap-2">
        {judge.canAttendInPerson == null ? (
          "Not asked"
        ) : judge.canAttendInPerson ? (
          "Yes"
        ) : (
          <span className="font-medium text-[var(--danger)]">No</span>
        )}
        {([true, false, null] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={attendanceLocked || judge.canAttendInPerson === value}
            title={attendanceLocked ? READ_ONLY_TITLE : undefined}
            onClick={() => onSetAttendance(value)}
            className={textLink}
          >
            {value === null ? "Clear" : value ? "Set Yes" : "Set No"}
          </button>
        ))}
      </span>,
    ],
    ["Applied", new Date(judge.createdAt).toLocaleString()],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 pb-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className={meta}>{label}</dt>
          <dd className="whitespace-pre-line break-words text-[15px] text-[var(--text-primary)]">
            {value || "Not given"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The judge roster for one edition: who applied, who is approved, adding a
 * judge by email and removing one. Running judging itself (rooms, schedule,
 * results) is on /admin/judging.
 */
export function JudgesTab({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const { data: portalContext } = usePortalContext();
  // judge.remove is super-admin only; other staff would only meet the refusal.
  const canRemove = portalContext?.role === "super_admin";

  const {
    data: judges,
    isLoading,
    isError,
    error: listError,
    refetch,
  } = trpc.judge.list.useQuery({
    hackathonId,
  });

  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newJudgeEmail, setNewJudgeEmail] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => {
    void utils.judge.list.invalidate({ hackathonId });
    setError(null);
  };

  const createJudge = trpc.judge.create.useMutation({
    onSuccess: () => {
      refresh();
      setNewJudgeEmail("");
      setShowAddForm(false);
    },
    onError: (e) => setError(e.message),
  });

  // Judges who applied through /judge/register arrive inactive; this is the
  // only thing that approves them.
  const setActive = trpc.judge.setActive.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });

  // Covers judges who answer the in-person question by email.
  const setAttendance = trpc.judge.setCanAttendInPerson.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });

  const removeJudge = trpc.judge.remove.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });

  const applyLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/judge/register?hackathonId=${hackathonId}`;

  if (isLoading) {
    return <p className={`py-16 ${body}`}>Loading judges…</p>;
  }

  if (isError) {
    return (
      <p className={`py-16 ${body}`}>
        {trpcErrorMessage(listError, "Could not load the judges.")}{" "}
        <button type="button" onClick={() => refetch()} className={textLink}>
          Try again
        </button>
      </p>
    );
  }

  const roster = judges ?? [];
  const approved = roster.filter((j) => j.isActive).length;
  const unanswered = roster.filter((j) => j.canAttendInPerson == null).length;
  const shown = roster.filter((j) =>
    filter === "all"
      ? true
      : filter === "unanswered"
        ? j.canAttendInPerson == null
        : filter === "approved"
          ? j.isActive
          : !j.isActive,
  );

  return (
    <div className="space-y-10">
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className={sectionTitle}>Judges</h2>
          <p className={`mt-2 ${meta}`}>
            {approved} approved · {roster.length - approved} waiting
          </p>
          <p className={`mt-1 max-w-xl ${meta}`}>
            Approved judges sign in and pick a room or table on their judge
            desk. Guest judges scan the QR code at a room or table instead and
            are not listed here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/admin/judging/${hackathonId}`} className={textLink}>
            Run judging
          </Link>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            aria-expanded={showAddForm}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" /> Add
            judge
          </button>
        </div>
      </section>

      {error && (
        <Alert rule>{error}</Alert>
      )}

      {showAddForm && (
        <section className="space-y-4 border-y border-[var(--border-subtle)] py-6">
          <form
            className="grid gap-4 sm:grid-cols-[1fr_auto] items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newJudgeEmail.trim()) return;
              setError(null);
              createJudge.mutate({ email: newJudgeEmail.trim(), hackathonId });
            }}
          >
            <FormInput
              label="Email"
              id="new-judge-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={newJudgeEmail}
              onChange={(e) => setNewJudgeEmail(e.target.value)}
              placeholder="judge@company.com"
            />
            <button
              type="submit"
              disabled={readOnly || !newJudgeEmail.trim() || createJudge.isPending}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={`${btnInk} whitespace-nowrap`}
            >
              {createJudge.isPending ? "Adding…" : "Add judge"}
            </button>
          </form>
          <p className={meta}>
            The person needs a portal account; signing in once creates one.
            Judges added here are approved straight away.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <p className={`flex-1 ${meta}`}>
              Or send judges the application link. You approve each one below.
            </p>
            <button
              type="button"
              onClick={() => {
                // writeText rejects when the page lacks clipboard permission,
                // and an organiser must still be able to read the link.
                const copyFailed = `Couldn't copy. The link is ${applyLink}`;
                const fail = () => setError(copyFailed);
                if (!navigator.clipboard) return fail();
                void navigator.clipboard.writeText(applyLink).then(() => {
                  // Clear an earlier copy failure, but not some other error.
                  setError((current) =>
                    current === copyFailed ? null : current,
                  );
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }, fail);
              }}
              className={btnSecondary}
            >
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              {linkCopied ? "Copied" : "Copy apply link"}
            </button>
          </div>
        </section>
      )}

      <section className={sectionRule}>
        {roster.length === 0 ? (
          <EmptyState>
            No judges yet. Add one by email, or send the application link.
          </EmptyState>
        ) : (
          <>
          <div
            role="group"
            aria-label="Filter judges"
            className="mb-4 flex flex-wrap gap-2"
          >
            {[...FILTERS, UNANSWERED].map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={filter === f.value ? btnInk : btnSecondary}
              >
                {f.label}
                {f.value === "unanswered" ? ` (${unanswered})` : ""}
              </button>
            ))}
          </div>
          {shown.length === 0 && (
            <EmptyState>No judges match this filter.</EmptyState>
          )}
          <ul className="border-t border-[var(--border-subtle)]">
            {shown.map((judge) => {
              const application = judge.assignments.find(
                (a) => a.hackathon?.id === hackathonId,
              );
              const name =
                judge.user?.name || judge.name || judge.user?.email || "Unnamed judge";
              const isOpen = openId === judge.id;
              return (
                <li
                  key={judge.id}
                  className="border-b border-[var(--border-subtle)]"
                >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 py-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Image
                      unoptimized
                      src={judge.user?.image || "/avatars/default.svg"}
                      alt=""
                      width={36}
                      height={36}
                      className="rounded-full bg-[var(--bg-secondary)] shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`${itemTitle} text-[17px] truncate`}>{name}</p>
                      <p className={`truncate ${meta}`}>
                        {[
                          judge.user?.email ?? judge.email,
                          application?.track
                            ? `Prefers ${application.track}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className={status(judge.isActive ? "success" : "warning")}>
                      {judge.isActive ? "Approved" : "Waiting"}
                    </span>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenId(isOpen ? null : judge.id)}
                      className={btnSecondary}
                    >
                      Details
                      <ChevronDown
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className={isOpen ? "rotate-180" : undefined}
                      />
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || setActive.isPending}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      onClick={() =>
                        setActive.mutate({
                          judgeId: judge.id,
                          isActive: !judge.isActive,
                        })
                      }
                      className={btnSecondary}
                    >
                      {judge.isActive ? "Suspend" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || !canRemove || removeJudge.isPending}
                      title={
                        readOnly
                          ? READ_ONLY_TITLE
                          : !canRemove
                            ? "Only a super admin can remove a judge. Suspend them instead."
                            : undefined
                      }
                      onClick={async () => {
                        if (
                          !await confirmDialog(
                            `Remove ${name} from this edition's judges? Their application is deleted.`,
                          )
                        )
                          return;
                        removeJudge.mutate({ judgeId: judge.id });
                      }}
                      className={btnDanger}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <JudgeDetails
                    judge={judge}
                    email={judge.user?.email ?? judge.email}
                    track={application?.track}
                    isLead={application?.isLead}
                    attendanceLocked={readOnly || setAttendance.isPending}
                    onSetAttendance={(canAttendInPerson) =>
                      setAttendance.mutate({
                        judgeId: judge.id,
                        canAttendInPerson,
                      })
                    }
                  />
                )}
                </li>
              );
            })}
          </ul>
          </>
        )}
      </section>
    </div>
  );
}
