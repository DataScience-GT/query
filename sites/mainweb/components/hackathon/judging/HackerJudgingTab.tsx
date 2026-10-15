"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import type { RouterOutputs } from "@query/api";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  object,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import { Itinerary, MissedBanner } from "./Itinerary";

// Hackers poll every 30 seconds; the timer below covers the moment a slot ends.
const POLL_MS = 30_000;
// setTimeout overflows past this and fires at once.
const MAX_TIMER_MS = 2_147_483_647;

type MyClaim = RouterOutputs["judging"]["hacker"]["myClaim"];

/** Delays a fast-changing value so it can drive a query without firing one per
 *  keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * The hacker's side of room judging: claim a place on the project, then see
 * where and when it presents, the team, and the judges' written feedback.
 */
export function HackerJudgingTab({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  // The event page's own path, so a tab link stays on it.
  const pathname = usePathname();
  const [lookup, setLookup] = useState<{ id: string; title: string } | null>(
    null,
  );

  const claimQuery = trpc.judging.hacker.myClaim.useQuery(
    { hackathonId },
    { refetchInterval: POLL_MS },
  );
  const state = claimQuery.data;
  const claim = state?.claim ?? null;
  // In emergency mode a hacker without a claim looks their project up instead.
  const lookupOpen = !!state && !claim && state.emergency && state.published;
  const itineraryEntryId = claim
    ? undefined
    : lookupOpen
      ? (lookup?.id ?? null)
      : null;

  const itinerary = trpc.judging.hacker.itinerary.useQuery(
    { hackathonId, entryId: itineraryEntryId ?? undefined },
    {
      enabled: !!state?.checkedIn && itineraryEntryId !== null,
      refetchInterval: POLL_MS,
    },
  );

  // The cache keeps the last project's itinerary after a claim goes away (an
  // organiser pulled the project); it must not show, or drive the timer.
  const itineraryData = itineraryEntryId !== null ? itinerary.data : undefined;
  const judgedSomewhere =
    !!itineraryData &&
    (itineraryData.appointments.some(
      (a) => a.status === "complete" || a.status === "incomplete",
    ) ||
      itineraryData.unscheduled.some((c) => c.judged));

  // Read once on opening, then polled only once a judge has been through:
  // before that there is nothing to wait for.
  const feedback = trpc.judging.hacker.feedback.useQuery(
    { hackathonId },
    {
      enabled: !!state?.checkedIn && !!claim && !state.emergency,
      refetchInterval: judgedSomewhere ? POLL_MS : false,
    },
  );

  // Statuses change when a slot ends. Ask the server a second after the next
  // one does, by its clock rather than the phone's, instead of waiting for the
  // poll to come round.
  const nextEndsAt = itineraryData?.nextEndsAt?.getTime();
  const serverNow = itineraryData?.serverNow.getTime();
  const refetchItinerary = itinerary.refetch;
  useEffect(() => {
    if (nextEndsAt === undefined || serverNow === undefined) return;
    const timer = window.setTimeout(
      () => void refetchItinerary(),
      Math.min(MAX_TIMER_MS, Math.max(0, nextEndsAt - serverNow) + 1000),
    );
    return () => window.clearTimeout(timer);
  }, [nextEndsAt, serverNow, refetchItinerary]);

  const refreshAll = () => {
    void utils.judging.hacker.myClaim.invalidate({ hackathonId });
    void utils.judging.hacker.itinerary.invalidate({ hackathonId });
    void utils.judging.hacker.feedback.invalidate({ hackathonId });
  };

  if (claimQuery.isLoading) {
    return <p className={`py-16 ${body}`}>Loading judging…</p>;
  }

  if (claimQuery.isError || !state) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className={body}>
          {trpcErrorMessage(
            claimQuery.error,
            "Judging did not load. Check your connection and try again.",
          )}
        </p>
        <button
          type="button"
          onClick={() => void claimQuery.refetch()}
          className={`min-h-11 ${btnSecondary}`}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!state.checkedIn) {
    return (
      <div className="max-w-xl">
        <h3 className={itemTitle}>Check in to see your judging</h3>
        <p className={`mt-2 ${body}`}>
          Judging is for hackers checked in at the event. Have your pass scanned
          at check-in (it is on the{" "}
          <Link
            href={`${pathname}?tab=SCHEDULE`}
            scroll={false}
            className="font-semibold text-[var(--text-primary)] underline decoration-accent decoration-2 underline-offset-[5px]"
          >
            Schedule &amp; pass tab
          </Link>
          ), and this tab then shows your project and where and when it
          presents.
        </p>
      </div>
    );
  }

  // A claimed hacker came for the times, so they lead and the team follows. In
  // lookup mode the result stays under the search that produced it.
  const whereAndWhen = itineraryEntryId !== null && (
    <section className={claim ? undefined : sectionRule}>
      <h3 className={sectionTitle}>Where and when</h3>
      <div className="mt-5">
        {itinerary.isLoading ? (
          <p className={body}>Loading times and places…</p>
        ) : itinerary.isError || !itineraryData ? (
          <div className="flex flex-col items-start gap-4">
            <p className={body}>
              {trpcErrorMessage(
                itinerary.error,
                "Times and places did not load. Try again in a moment.",
              )}
            </p>
            <button
              type="button"
              onClick={() => void itinerary.refetch()}
              className={`min-h-11 ${btnSecondary}`}
            >
              Try again
            </button>
          </div>
        ) : (
          <Itinerary
            data={itineraryData}
            receivedAt={itinerary.dataUpdatedAt}
          />
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-10">
      {state.emergency && (
        <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]">
          Organisers have switched judging to emergency mode. Team lists,
          invites and feedback are off until it ends; the times and places
          here still apply.
        </p>
      )}

      {itineraryData?.missed && <MissedBanner />}

      {claim ? (
        <>
          {whereAndWhen}
          <ClaimedProject
            hackathonId={hackathonId}
            claim={claim}
            onChanged={() =>
              void utils.judging.hacker.myClaim.invalidate({ hackathonId })
            }
          />
        </>
      ) : lookupOpen ? (
        <>
          <ProjectLookup
            hackathonId={hackathonId}
            selected={lookup}
            onSelect={setLookup}
          />
          {whereAndWhen}
        </>
      ) : (
        <ClaimPrompt
          hackathonId={hackathonId}
          offers={state.offers}
          claimsStarted={state.claimsStarted}
          onClaimed={refreshAll}
        />
      )}

      {claim &&
        !state.emergency &&
        feedback.data?.available &&
        (feedback.data.items.length > 0 || judgedSomewhere) && (
          <section className={sectionRule}>
            <h3 className={sectionTitle}>Feedback</h3>
            {feedback.data.items.length === 0 ? (
              <p className={`mt-3 ${body}`}>
                No written feedback yet. Judges&apos; comments appear here once
                they submit. Their names and scores stay private.
              </p>
            ) : (
              <div className="mt-5 space-y-8">
                {feedback.data.items.map((item, index) => (
                  <article key={`${item.challenge}-${index}`}>
                    <h4 className={label}>{item.challenge}</h4>
                    <dl className="mt-2 space-y-3 border-l-2 border-[var(--border-medium)] pl-4">
                      {item.responses.map((response) => (
                        <div key={response.label}>
                          <dt className="text-[13px] font-medium text-[var(--text-secondary)]">
                            {response.label}
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-[var(--text-primary)]">
                            {response.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
                <p className={meta}>
                  Judges&apos; names and scores stay private.
                </p>
              </div>
            )}
          </section>
        )}
    </div>
  );
}

function ClaimPrompt({
  hackathonId,
  offers,
  claimsStarted,
  onClaimed,
}: {
  hackathonId: string;
  offers: MyClaim["offers"];
  claimsStarted: boolean;
  onClaimed: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const claimByEmail = trpc.judging.hacker.claimByEmail.useMutation({
    onSuccess: onClaimed,
    onError: (e) =>
      setError(trpcErrorMessage(e, "That claim did not go through.")),
  });
  // A project filed on the portal is not in judging until organisers move it,
  // so with nothing to claim this is what the hacker is waiting on.
  const submission = trpc.team.mySubmission.useQuery(
    { hackathonId },
    { enabled: offers.length === 0 },
  );

  if (offers.length === 0) {
    // Held back until the answer is in, so the claim copy does not flash first.
    if (submission.isLoading) {
      return <p className={body}>Loading your project…</p>;
    }
    const submitted = submission.data;
    // A withdrawn project stays as a draft row, so the row alone is not a
    // submission.
    if (submitted && submitted.status !== "draft" && !submitted.inJudging) {
      return (
        <section className="max-w-xl">
          <h3 className={sectionTitle}>Your project</h3>
          <p className={`mt-3 ${body}`}>
            {submitted.name} is submitted; it appears here once organisers move
            submissions into judging.
          </p>
        </section>
      );
    }

    return (
      <section className="max-w-xl">
        <h3 className={sectionTitle}>Claim your project</h3>
        <p className={`mt-3 ${body}`}>
          {claimsStarted
            ? "Organisers emailed a claim link to the address each teammate used on Devpost. Open it while signed in to the portal."
            : "Claim links have not gone out yet. Organisers email one to the address each teammate used on Devpost."}
        </p>
        <p className={`mt-3 ${body}`}>
          A teammate who has already claimed can add you instead, using the
          email you sign in here with.
        </p>
        <p className={`mt-3 ${meta}`}>
          Used another email on Devpost, or nothing arrived? Ask an organiser at
          the help desk for your link.
        </p>
      </section>
    );
  }

  const single = offers.length === 1;

  return (
    <section className="max-w-xl">
      <h3 className={sectionTitle}>Claim your project</h3>
      <p className={`mt-3 ${body}`}>
        {single
          ? "Your portal email is on this project's team list. Claim your place to see where and when it presents."
          : `Your portal email is on ${offers.length} projects. Claim the one you built; each person is on one project per event.`}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <ul className="mt-5 space-y-4">
        {offers.map((offer) => (
          <li key={offer.memberId} className={`${object} p-5`}>
            <p className={itemTitle}>{offer.title}</p>
            <p className={`mt-1 ${meta}`}>Listed as {offer.name}</p>
            {offer.teamTooLarge ? (
              <p className="mt-4 border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]">
                This team lists more than four people. Ask an organiser at the
                help desk to fix the list.
              </p>
            ) : (
              <button
                type="button"
                disabled={claimByEmail.isPending}
                onClick={() => {
                  setError(null);
                  claimByEmail.mutate({
                    hackathonId,
                    memberId: offer.memberId,
                  });
                }}
                className={`mt-4 min-h-11 w-full sm:w-auto ${single ? btnPrimary : btnSecondary}`}
              >
                {claimByEmail.isPending &&
                claimByEmail.variables?.memberId === offer.memberId
                  ? "Claiming…"
                  : "Claim my place"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClaimedProject({
  hackathonId,
  claim,
  onChanged,
}: {
  hackathonId: string;
  claim: NonNullable<MyClaim["claim"]>;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    tone: "success" | "warning" | "danger";
  } | null>(null);

  const invite = trpc.judging.hacker.invite.useMutation({
    onSuccess: (result) => {
      setNotice({
        text: result.message,
        tone: result.emailed ? "success" : "warning",
      });
      setEmail("");
      onChanged();
    },
    onError: (e) =>
      setNotice({
        text: trpcErrorMessage(e, "That teammate was not added."),
        tone: "danger",
      }),
  });

  const noticeBorder = {
    success: "border-[var(--success)]",
    warning: "border-[var(--warning)]",
    danger: "border-[var(--danger)]",
  };

  return (
    <section className={sectionRule}>
      <p className={label}>Your project</p>
      <h3 className={`mt-1 ${sectionTitle}`}>{claim.title}</h3>

      {claim.members && (
        <div className="mt-6">
          <h4 className={label}>Team</h4>
          <ul className="mt-2 border-t border-[var(--border-subtle)]">
            {claim.members.map((member) => (
              <li
                key={member.id}
                className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-2.5"
              >
                <span className="min-w-0 truncate text-[15px] text-[var(--text-primary)]">
                  {member.name}
                  {member.isYou && <span className={meta}> (you)</span>}
                </span>
                <span
                  className={`shrink-0 ${status(member.claimed ? "success" : "neutral")}`}
                >
                  {member.claimed
                    ? "Claimed"
                    : member.addedByTeammate
                      ? "Invited"
                      : "Not claimed"}
                </span>
              </li>
            ))}
          </ul>

          {claim.canInvite ? (
            <form
              className="mt-6 max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                if (!email.trim()) return;
                setNotice(null);
                invite.mutate({ hackathonId, email: email.trim() });
              }}
            >
              <label htmlFor="judging-invite-email" className={fieldLabel}>
                Add a teammate
              </label>
              <div className="flex gap-3">
                <input
                  id="judging-invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@gatech.edu"
                  className={`min-h-11 min-w-0 ${input}`}
                />
                <button
                  type="submit"
                  disabled={!email.trim() || invite.isPending}
                  className={`min-h-11 shrink-0 ${btnSecondary}`}
                >
                  {invite.isPending ? "Adding…" : "Add"}
                </button>
              </div>
              <p className={fieldHint}>
                Use the email they sign in to the portal with. They must be
                checked in, and a team has at most four people.
              </p>
            </form>
          ) : (
            <p className={`mt-4 ${meta}`}>
              Your team has four people, the most judging allows.
            </p>
          )}

          {notice && (
            <p
              role={notice.tone === "danger" ? "alert" : "status"}
              className={`mt-4 max-w-xl border-l-2 pl-3 text-[15px] text-[var(--text-primary)] ${noticeBorder[notice.tone]}`}
            >
              {notice.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ProjectLookup({
  hackathonId,
  selected,
  onSelect,
}: {
  hackathonId: string;
  selected: { id: string; title: string } | null;
  onSelect: (project: { id: string; title: string } | null) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);
  const results = trpc.judging.hacker.searchProjects.useQuery(
    { hackathonId, query },
    { enabled: query.length >= 2 && !selected },
  );

  if (selected) {
    return (
      <section>
        <p className={label}>Showing</p>
        <h3 className={`mt-1 ${sectionTitle}`}>{selected.title}</h3>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`mt-3 min-h-11 ${textLink}`}
        >
          Look up another project
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-xl">
      <h3 className={sectionTitle}>Find your project</h3>
      <p className={`mt-3 ${body}`}>
        Search by your project&apos;s title to see where and when it presents.
      </p>
      <label htmlFor="judging-project-search" className={`mt-5 ${fieldLabel}`}>
        Project title
      </label>
      <input
        id="judging-project-search"
        type="search"
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`min-h-11 ${input}`}
      />

      {query.length >= 2 && (
        <div className="mt-4">
          {results.isLoading ? (
            <p className={meta}>Searching…</p>
          ) : results.isError ? (
            <p className="text-[15px] text-[var(--danger)]">
              {trpcErrorMessage(
                results.error,
                "Search did not work. Try again.",
              )}
            </p>
          ) : results.data && results.data.length > 0 ? (
            <ul className="border-t border-[var(--border-subtle)]">
              {results.data.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(project)}
                    className="flex min-h-11 w-full items-center border-b border-[var(--border-subtle)] py-2.5 text-left text-[15px] font-semibold text-[var(--text-primary)] transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {project.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={meta}>
              No project matches &ldquo;{query}&rdquo;. Check the spelling, or
              ask at the help desk.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
