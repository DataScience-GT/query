"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import SkillsInterestsInput from "@/components/portal/profile/SkillsInterestsInput";

/**
 * The club member profile.
 *
 * The columns (school, major, graduation year, skills, interests, socials),
 * `member.register`/`update` and SkillsInterestsInput all existed with nothing
 * calling any of them — the data was collectable in principle and reachable
 * from nowhere. This is the screen that closes that loop.
 *
 * Membership itself is not editable here: a term comes from a payment, and the
 * only things this writes are the profile fields.
 */

const inputClass =
  "w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors";

export function MembershipTab() {
  const utils = trpc.useUtils();

  const { data: member, isPending } = trpc.member.me.useQuery();
  const { data: status } = trpc.member.checkStatus.useQuery();
  const { data: history } = trpc.member.history.useQuery(undefined, {
    // Throws NOT_FOUND for somebody who has no member row at all, which is a
    // normal state here rather than an error worth retrying.
    enabled: !!member,
    retry: false,
  });

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    school: "",
    major: "",
    graduationYear: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!member) return;
    setForm({
      firstName: member.firstName ?? "",
      lastName: member.lastName ?? "",
      school: member.school ?? "",
      major: member.major ?? "",
      graduationYear: member.graduationYear ? String(member.graduationYear) : "",
      linkedinUrl: member.linkedinUrl ?? "",
      githubUrl: member.githubUrl ?? "",
      portfolioUrl: member.portfolioUrl ?? "",
    });
    setSkills(member.skills ?? []);
    setInterests(member.interests ?? []);
  }, [member]);

  const done = () => {
    setError(null);
    setSaved(true);
    utils.member.me.invalidate();
    utils.member.history.invalidate();
    setTimeout(() => setSaved(false), 3000);
  };

  const create = trpc.member.register.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = trpc.member.update.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });

  const save = () => {
    setError(null);

    const year = form.graduationYear.trim()
      ? Number(form.graduationYear)
      : null;
    if (year !== undefined && !Number.isInteger(year)) {
      setError("That graduation year does not look right.");
      return;
    }

    /**
     * An emptied field sends `null`, not `undefined`.
     *
     * `undefined` means "leave it alone", so sending it for a field somebody
     * just cleared made the save report success and change nothing — the old
     * value came straight back on the next read. `""` is not an option either:
     * these validate as URLs and as min-length strings, so an empty string is
     * a validation error rather than a clear.
     */
    const orNull = (value: string) => value.trim() || null;

    const payload = {
      school: orNull(form.school),
      major: orNull(form.major),
      graduationYear: year,
      skills,
      interests,
      linkedinUrl: orNull(form.linkedinUrl),
      githubUrl: orNull(form.githubUrl),
      portfolioUrl: orNull(form.portfolioUrl),
    };

    if (member) {
      update.mutate(payload);
    } else {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        setError("First and last name are required to create your profile.");
        return;
      }
      create.mutate({
        ...payload,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      });
    }
  };

  if (isPending) {
    return (
      <p className="text-sm font-mono text-[var(--text-subtle)]">Loading…</p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight text-[var(--text-primary)]">
          Membership
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {status?.isMember
            ? `Active until ${status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : "—"}${
                status.daysRemaining !== null
                  ? ` · ${status.daysRemaining} days left`
                  : ""
              }`
            : status?.hasLapsed
              ? "Your membership has lapsed. Renew from the portal dashboard."
              : "You are not a paid member yet. Membership is bought from the portal dashboard."}
        </p>
      </div>

      <div className="space-y-5">
        {!member && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="member-first"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                First name
              </label>
              <input
                id="member-first"
                className={inputClass}
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                maxLength={100}
              />
            </div>
            <div>
              <label
                htmlFor="member-last"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Last name
              </label>
              <input
                id="member-last"
                className={inputClass}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                maxLength={100}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="member-school"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              School
            </label>
            <input
              id="member-school"
              className={inputClass}
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
              placeholder="Georgia Institute of Technology"
              maxLength={200}
            />
          </div>
          <div>
            <label
              htmlFor="member-major"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Major
            </label>
            <input
              id="member-major"
              className={inputClass}
              value={form.major}
              onChange={(e) => setForm({ ...form, major: e.target.value })}
              placeholder="Computer Science"
              maxLength={200}
            />
          </div>
          <div>
            <label
              htmlFor="member-grad"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Graduation year
            </label>
            <input
              id="member-grad"
              className={inputClass}
              value={form.graduationYear}
              onChange={(e) =>
                setForm({ ...form, graduationYear: e.target.value })
              }
              placeholder="2029"
              inputMode="numeric"
            />
          </div>
        </div>

        <div>
          <p className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
            Skills
          </p>
          <SkillsInterestsInput
            items={skills}
            setItems={setSkills}
            placeholder="Type a skill and press Enter"
            maxItems={20}
            accentColor="accent"
          />
        </div>

        <div>
          <p className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
            Interests
          </p>
          <SkillsInterestsInput
            items={interests}
            setItems={setInterests}
            placeholder="Type an interest and press Enter"
            maxItems={20}
            accentColor="accent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(
            [
              ["linkedinUrl", "LinkedIn", "https://linkedin.com/in/…"],
              ["githubUrl", "GitHub", "https://github.com/…"],
              ["portfolioUrl", "Portfolio", "https://…"],
            ] as const
          ).map(([field, label, placeholder]) => (
            <div key={field}>
              <label
                htmlFor={`member-${field}`}
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                {label}
              </label>
              <input
                id={`member-${field}`}
                className={inputClass}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                placeholder={placeholder}
                maxLength={500}
              />
            </div>
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs font-mono text-red-300 border border-red-500/30 bg-red-500/10 px-3 py-2"
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            role="status"
            className="text-xs font-mono text-accent border border-accent/30 bg-accent/10 px-3 py-2"
          >
            Saved.
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={create.isPending || update.isPending}
          className="px-8 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-xs uppercase tracking-widest rounded-none hover:bg-accent/20 transition-colors disabled:opacity-40"
        >
          {create.isPending || update.isPending ? "Saving…" : "Save profile"}
        </button>
      </div>

      {(history?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
            Membership history
          </h3>
          <ul className="space-y-1">
            {history?.map((row) => (
              <li
                key={row.id}
                className="text-[11px] font-mono text-[var(--text-muted)]"
              >
                {new Date(row.startDate).toLocaleDateString()} →{" "}
                {row.endDate ? new Date(row.endDate).toLocaleDateString() : "—"}{" "}
                · {row.action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
