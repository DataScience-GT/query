"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import SkillsInterestsInput from "@/components/portal/profile/SkillsInterestsInput";
import {
  sectionTitle,
  itemTitle,
  body,
  fieldLabel,
  input,
  btnPrimary,
  status as statusClass,
} from "@/components/portal/ui";

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

  // Refill the form whenever a new member record arrives. Done during render
  // rather than in an effect, so the stale form never paints.
  const [filledFrom, setFilledFrom] = useState<typeof member>(undefined);
  if (member && member !== filledFrom) {
    setFilledFrom(member);
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
  }

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

    // `null` is a graduation year that was left blank, which is allowed and is
    // what clears the column. The guard compared against `undefined` instead,
    // so `Number.isInteger(null)` failed it and the whole form refused to save
    // — school, skills, socials and all — until a year was typed in.
    const year = form.graduationYear.trim()
      ? Number(form.graduationYear)
      : null;
    if (year !== null && !Number.isInteger(year)) {
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
      <p className="text-[13px] text-[var(--text-subtle)]">Loading…</p>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className={sectionTitle}>Membership</h2>
        {status?.isMember ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={statusClass("success")}>
              Active until{" "}
              {status.expiresAt
                ? new Date(status.expiresAt).toLocaleDateString()
                : "—"}
            </span>
            {status.daysRemaining !== null && (
              <span className="text-[13px] text-[var(--text-subtle)]">
                {status.daysRemaining} days left
              </span>
            )}
          </p>
        ) : status?.hasLapsed ? (
          <div className="mt-3 space-y-1">
            <p className={statusClass("warning")}>Lapsed</p>
            <p className={body}>
              Your membership has lapsed. Renew from the portal dashboard.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-1">
            <p className={statusClass("neutral")}>Not a member</p>
            <p className={body}>
              You are not a paid member yet. Membership is bought from the
              portal dashboard.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-6 border-t border-[var(--border-subtle)] pt-6">
        {!member && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="member-first"
                className={fieldLabel}
              >
                First name
              </label>
              <input
                id="member-first"
                className={input}
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
                className={fieldLabel}
              >
                Last name
              </label>
              <input
                id="member-last"
                className={input}
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
              className={fieldLabel}
            >
              School
            </label>
            <input
              id="member-school"
              className={input}
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
              placeholder="Georgia Institute of Technology"
              maxLength={200}
            />
          </div>
          <div>
            <label
              htmlFor="member-major"
              className={fieldLabel}
            >
              Major
            </label>
            <input
              id="member-major"
              className={input}
              value={form.major}
              onChange={(e) => setForm({ ...form, major: e.target.value })}
              placeholder="Computer Science"
              maxLength={200}
            />
          </div>
          <div>
            <label
              htmlFor="member-grad"
              className={fieldLabel}
            >
              Graduation year
            </label>
            <input
              id="member-grad"
              className={input}
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
          <p className={fieldLabel}>
            Skills
          </p>
          <SkillsInterestsInput
            items={skills}
            setItems={setSkills}
            placeholder="Type a skill and press Enter"
            maxItems={20}
          />
        </div>

        <div>
          <p className={fieldLabel}>
            Interests
          </p>
          <SkillsInterestsInput
            items={interests}
            setItems={setInterests}
            placeholder="Type an interest and press Enter"
            maxItems={20}
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
                className={fieldLabel}
              >
                {label}
              </label>
              <input
                id={`member-${field}`}
                className={input}
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
            className="text-[13px] text-[var(--danger)]"
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            role="status"
            className="text-[13px] text-[var(--success)]"
          >
            Saved.
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={create.isPending || update.isPending}
          className={btnPrimary}
        >
          {create.isPending || update.isPending ? "Saving…" : "Save profile"}
        </button>
      </div>

      {(history?.length ?? 0) > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-6">
          <h3 className={itemTitle}>Membership history</h3>
          <ul className="mt-3 border-t border-[var(--border-subtle)]">
            {history?.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-2 py-2.5 border-b border-[var(--border-subtle)] text-[15px] text-[var(--text-primary)]"
              >
                <span>
                  {new Date(row.startDate).toLocaleDateString()} –{" "}
                  {row.endDate ? new Date(row.endDate).toLocaleDateString() : "—"}
                </span>
                <span className="text-[13px] text-[var(--text-subtle)]">
                  · {row.action}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
