"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

const EXPERIENCE_OPTIONS = [
  { value: "first", label: "This would be my first" },
  { value: "one_or_two", label: "I've done one or two" },
  { value: "three_plus", label: "I've done three or more" },
] as const;

type Experience = (typeof EXPERIENCE_OPTIONS)[number]["value"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block mt-1.5 text-[10px] text-[var(--text-muted)]/70">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full px-4 py-3 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-sm focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-[var(--text-muted)]/50 transition-ui";

/**
 * Join / leave the interest list for one edition.
 *
 * The row is keyed by hackathon id, not by a singleton funnel. /hacklytics
 * and this edition's Info tab both have to write against the same UUID or
 * staff looking at Digital Bloom see an empty list next to a form that
 * actually landed on a different event.
 */
export function InterestForm({
  hackathonId,
  callbackPath,
}: {
  hackathonId: string;
  callbackPath: string;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const utils = trpc.useUtils();

  const mine = trpc.hackathon.myInterest.useQuery(
    { hackathonId },
    { enabled: !!hackathonId && !!session },
  );

  const [school, setSchool] = useState("");
  const [country, setCountry] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [experience, setExperience] = useState<Experience | "">("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mine.data) return;
    setSchool(mine.data.school ?? "");
    setCountry(mine.data.country ?? "");
    setGraduationYear(
      mine.data.graduationYear ? String(mine.data.graduationYear) : "",
    );
    setExperience((mine.data.experience as Experience) ?? "");
  }, [mine.data]);

  const refresh = async () => {
    await Promise.all([
      utils.hackathon.myInterest.invalidate({ hackathonId }),
      utils.hackathon.interestCount.invalidate({ hackathonId }),
    ]);
  };

  const join = trpc.hackathon.registerInterest.useMutation({
    onSuccess: async () => {
      setError("");
      setEditing(false);
      await refresh();
    },
    onError: (e) => setError(e.message),
  });

  const leave = trpc.hackathon.withdrawInterest.useMutation({
    onSuccess: async () => {
      setError("");
      setEditing(false);
      await refresh();
    },
    onError: (e) => setError(e.message),
  });

  const onList = !!mine.data;
  const showForm = !onList || editing;
  const busy = join.isPending || leave.isPending;

  if (sessionStatus === "loading") {
    return <p className="text-sm text-[var(--text-muted)]">Checking sign-in…</p>;
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-primary)]">
          Get told the moment it opens
        </h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          Sign in so we have a verified address to reach you at. Google,
          GitHub, or a code sent to any email — no account needed beforehand,
          and it works wherever you are in the world.
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}
          className="inline-flex px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-[var(--text-primary)] transition-ui"
        >
          Sign in to join the list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-primary)]">
          {onList ? "You're on the list" : "Join the interest list"}
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">
          {onList
            ? `We'll email ${session.user?.email} the moment registration opens.`
            : "Four optional questions. They only shape how we plan the event — none of them affect whether you get in."}
        </p>
      </div>

      {showForm ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const parsedYear = graduationYear.trim()
              ? Number(graduationYear)
              : null;
            if (
              parsedYear !== null &&
              (!Number.isInteger(parsedYear) ||
                parsedYear < 1900 ||
                parsedYear > 2100)
            ) {
              setError("That graduation year does not look right.");
              return;
            }
            join.mutate({
              hackathonId,
              school: school.trim() || undefined,
              country: country.trim() || undefined,
              graduationYear: parsedYear,
              experience: experience || undefined,
            });
          }}
        >
          <Field label="School or university">
            <input
              className={inputClass}
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="Georgia Institute of Technology"
              maxLength={200}
            />
          </Field>

          <Field
            label="Country"
            hint="Hacklytics is open worldwide — this helps us plan travel and timing."
          >
            <input
              className={inputClass}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="United States"
              maxLength={100}
            />
          </Field>

          <Field label="Graduation year">
            <input
              className={inputClass}
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
              placeholder="2029"
              inputMode="numeric"
            />
          </Field>

          <Field label="Hackathon experience">
            <select
              className={inputClass}
              value={experience}
              onChange={(e) =>
                setExperience(e.target.value as Experience | "")
              }
            >
              <option value="">Prefer not to say</option>
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          {error ? (
            <p className="text-rose-400 font-mono text-[11px]">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-[var(--text-primary)] transition-ui disabled:opacity-40"
            >
              {busy
                ? "Saving…"
                : onList
                  ? "Save changes"
                  : "Notify me when it opens"}
            </button>
            {onList ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                disabled={busy}
                className="px-6 py-4 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-ui disabled:opacity-40"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-6 py-4 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-ui"
          >
            Edit my answers
          </button>
          <button
            type="button"
            onClick={() => leave.mutate({ hackathonId })}
            disabled={busy}
            className="px-6 py-4 text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:text-rose-400 transition-ui disabled:opacity-40"
          >
            {leave.isPending ? "Leaving…" : "Take me off the list"}
          </button>
        </div>
      )}

      {error && !showForm ? (
        <p className="text-rose-400 font-mono text-[11px]">{error}</p>
      ) : null}
    </div>
  );
}
