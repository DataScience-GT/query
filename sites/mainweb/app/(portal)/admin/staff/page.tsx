"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { usePortalContext } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  meta,
  object,
  page,
  pageDek,
  sectionTitle,
} from "@/components/portal/ui";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

/**
 * Staff and roles.
 *
 * `admin.create`/`update`/`list` have existed for a long time with nothing
 * calling them, so the only way to make somebody a volunteer was an INSERT
 * against production — while /scan's own rejection screen told them to "ask an
 * organiser to add you as event staff". This is that screen.
 */

const ROLES = [
  {
    id: "volunteer" as const,
    label: "Volunteer",
    hint: "Hackathon badge scanning at /scan and club pass scanning at /scan/club. Nothing else — the admin pages refuse them.",
  },
  {
    id: "moderator" as const,
    label: "Moderator",
    hint: "Full staff access to the admin pages.",
  },
  {
    id: "admin" as const,
    label: "Admin",
    hint: "Full staff access to the admin pages.",
  },
  {
    id: "super_admin" as const,
    label: "Super admin",
    hint: "Also grants and revokes roles, and can delete an edition.",
  },
];

type Role = (typeof ROLES)[number]["id"];

/** ISO day rather than a locale format: this renders on the server too, and a
 *  locale-dependent string mismatches on hydration. */
const termDate = (value: string | Date) =>
  new Date(value).toISOString().slice(0, 10);

export default function StaffPage() {
  const utils = trpc.useUtils();
  const { data: portalContext, isLoading: contextLoading } = usePortalContext();

  const [email, setEmail] = useState("");
  const [searchedEmail, setSearchedEmail] = useState("");
  const [role, setRole] = useState<Role>("volunteer");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: staff, isLoading: staffLoading } = trpc.admin.list.useQuery();

  const isSuperAdmin = portalContext?.role === "super_admin";

  const lookup = trpc.admin.findUserByEmail.useQuery(
    { email: searchedEmail },
    { enabled: isSuperAdmin && searchedEmail.length > 0, retry: false },
  );

  const done = (message: string) => {
    setError(null);
    setNotice(message);
    utils.admin.list.invalidate();
    lookup.refetch();
  };

  const createStaff = trpc.admin.create.useMutation({
    onSuccess: () => done("Role granted."),
    onError: (e) => setError(e.message),
  });

  const updateStaff = trpc.admin.update.useMutation({
    onSuccess: () => done("Role updated."),
    onError: (e) => setError(e.message),
  });

  if (contextLoading) return <LoadingScreen message="Loading…" />;

  // Granting a role is super-admin only server-side; saying so beats rendering
  // a form whose every button is refused.
  if (!isSuperAdmin) {
    return (
      <div className={page}>
        <h1 className={adminTitle}>Staff &amp; roles</h1>
        <p className={pageDek}>
          Only a super admin can grant or change staff roles. Ask one of them
          to add you or the person you are trying to add.
        </p>
      </div>
    );
  }

  return (
    <div className={page}>
      <h1 className={adminTitle}>Staff &amp; roles</h1>
      <p className={pageDek}>
        Grant the volunteer role before the event, not at the door.
      </p>

      <section className="mt-10 space-y-6">
        <div>
          <label htmlFor="staff-email" className={fieldLabel}>
            Their sign-in email
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="staff-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="them@gatech.edu"
              className={`${input} sm:flex-1`}
            />
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setError(null);
                setSearchedEmail(email.trim().toLowerCase());
              }}
              disabled={!email.trim()}
              className={btnSecondary}
            >
              Find
            </button>
          </div>
          <p className={fieldHint}>
            They must have signed in at least once. The role attaches to an
            existing account.
          </p>
        </div>

        {searchedEmail && !lookup.isPending && !lookup.data && (
          <p className="text-[13px] text-[var(--warning)]">
            No account for {searchedEmail}. Ask them to sign in once, then look
            again.
          </p>
        )}

        {lookup.data && (
          <div className={`${object} p-5 space-y-5`}>
            <div>
              <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                {lookup.data.name ?? "Unnamed account"}
              </p>
              <p className={meta}>{lookup.data.email}</p>
              {lookup.data.existingRole && (
                <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                  Already {lookup.data.existingRole.role}
                  {lookup.data.existingRole.isActive ? "" : " (deactivated)"}
                  {lookup.data.existingRole.expiresAt
                    ? ` until ${termDate(lookup.data.existingRole.expiresAt)}`
                    : ""}
                </p>
              )}
            </div>

            <fieldset>
              <legend className={fieldLabel}>Role</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRole(option.id)}
                    aria-pressed={role === option.id}
                    className={`p-3 text-left rounded-[var(--radius-sm)] border transition-colors ${
                      role === option.id
                        ? "border-accent bg-[var(--bg-secondary)]"
                        : "border-[var(--border-medium)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {option.label}
                    </p>
                    <p className={`${meta} mt-1`}>{option.hint}</p>
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              onClick={() => {
                const target = lookup.data;
                if (!target) return;
                if (target.existingRole) {
                  updateStaff.mutate({
                    adminId: target.existingRole.id,
                    role,
                    isActive: true,
                  });
                } else {
                  createStaff.mutate({ userId: target.id, role });
                }
              }}
              disabled={createStaff.isPending || updateStaff.isPending}
              className={btnPrimary}
            >
              {lookup.data.existingRole ? "Change role" : "Grant role"}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-[13px] text-[var(--success)]">
            {notice}
          </p>
        )}
      </section>

      <section className="mt-12 border-t border-[var(--border-subtle)] pt-8">
        <h2 className={`${sectionTitle} mb-4`}>Current staff</h2>
        {staffLoading ? (
          <p className={meta}>Loading…</p>
        ) : (staff?.length ?? 0) === 0 ? (
          <p className={body}>
            Nobody has a staff role yet. Find someone above to grant one.
          </p>
        ) : (
          <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {staff?.map((row) => (
              <div
                key={row.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {row.user?.name ?? "Unnamed account"}
                  </p>
                  <p className={`${meta} break-all`}>
                    {row.user?.email} · {row.role}
                    {row.isActive ? "" : " · deactivated"}
                    {row.expiresAt
                      ? new Date(row.expiresAt) < new Date()
                        ? ` · expired ${termDate(row.expiresAt)}`
                        : ` · until ${termDate(row.expiresAt)}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setError(null);
                    updateStaff.mutate({
                      adminId: row.id,
                      isActive: !row.isActive,
                    });
                  }}
                  disabled={updateStaff.isPending}
                  className={`${row.isActive ? btnDanger : btnSecondary} shrink-0 self-start sm:self-auto`}
                >
                  {row.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
