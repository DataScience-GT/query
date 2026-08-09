"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { usePortalContext } from "@/lib/use-portal-context";
import { ShieldCheck } from "lucide-react";

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
    hint: "Badge scanning at /scan. Nothing else — the admin pages refuse them.",
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

  if (contextLoading) return <LoadingScreen message="Loading..." />;

  // Granting a role is super-admin only server-side; saying so beats rendering
  // a form whose every button is refused.
  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-6">
        <LiquidGlass className="p-8 border-[var(--border-subtle)]">
          <h1 className="text-xl font-black uppercase tracking-tight text-[var(--text-primary)] mb-2">
            Staff &amp; roles
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-mono">
            Only a super admin can grant or change staff roles. Ask one of them
            to add you or the person you are trying to add.
          </p>
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-16 px-6 space-y-8">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-accent" />
          Staff &amp; roles
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] font-mono">
          Grant the volunteer tier before the event, not at the door.
        </p>
      </div>

      <LiquidGlass className="p-6 border-[var(--border-subtle)] space-y-5">
        <div>
          <label
            htmlFor="staff-email"
            className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
          >
            Their sign-in email
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="them@gatech.edu"
              className="flex-1 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setError(null);
                setSearchedEmail(email.trim().toLowerCase());
              }}
              disabled={!email.trim()}
              className="px-6 py-3 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest rounded-none hover:bg-white/10 transition-colors disabled:opacity-30"
            >
              Find
            </button>
          </div>
          <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-2">
            They must have signed in at least once — the role attaches to an
            existing account.
          </p>
        </div>

        {searchedEmail && !lookup.isPending && !lookup.data && (
          <p className="text-xs font-mono text-amber-300">
            No account for {searchedEmail}. Ask them to sign in once, then look
            again.
          </p>
        )}

        {lookup.data && (
          <div className="p-4 bg-white/[0.02] border border-[var(--border-subtle)] space-y-4">
            <div>
              <p className="text-sm text-[var(--text-primary)] font-bold">
                {lookup.data.name ?? "Unnamed account"}
              </p>
              <p className="text-xs font-mono text-[var(--text-subtle)]">
                {lookup.data.email}
              </p>
              {lookup.data.existingRole && (
                <p className="text-xs font-mono text-accent mt-2">
                  Already {lookup.data.existingRole.role}
                  {lookup.data.existingRole.isActive ? "" : " (deactivated)"}
                </p>
              )}
            </div>

            <fieldset>
              <legend className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-3 font-mono">
                Role
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRole(option.id)}
                    aria-pressed={role === option.id}
                    className={`p-3 text-left border rounded-none transition-colors ${
                      role === option.id
                        ? "bg-accent/10 border-accent/40"
                        : "bg-[var(--bg-primary)]/40 border-[var(--border-subtle)] hover:border-accent/20"
                    }`}
                  >
                    <p
                      className={`text-sm font-bold ${role === option.id ? "text-accent" : "text-[var(--text-primary)]"}`}
                    >
                      {option.label}
                    </p>
                    <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-1">
                      {option.hint}
                    </p>
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
              className="px-6 py-3 bg-accent/10 border border-accent/40 text-accent text-xs font-bold uppercase tracking-widest rounded-none hover:bg-accent/20 transition-colors disabled:opacity-40"
            >
              {lookup.data.existingRole ? "Change role" : "Grant role"}
            </button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-xs font-mono text-red-300 border border-red-500/30 bg-red-500/10 px-3 py-2"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="text-xs font-mono text-accent border border-accent/30 bg-accent/10 px-3 py-2"
          >
            {notice}
          </p>
        )}
      </LiquidGlass>

      <LiquidGlass className="p-6 border-[var(--border-subtle)]">
        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest mb-4">
          Current staff
        </h2>
        {staffLoading ? (
          <p className="text-xs font-mono text-[var(--text-subtle)]">
            Loading...
          </p>
        ) : (staff?.length ?? 0) === 0 ? (
          <p className="text-xs font-mono text-[var(--text-subtle)]">
            Nobody yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {staff?.map((row) => (
              <div
                key={row.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm text-[var(--text-primary)]">
                    {row.user?.name ?? "Unnamed account"}
                  </p>
                  <p className="text-[11px] font-mono text-[var(--text-subtle)]">
                    {row.user?.email} · {row.role}
                    {row.isActive ? "" : " · deactivated"}
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
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-none border transition-colors disabled:opacity-40 ${
                    row.isActive
                      ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                      : "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                  }`}
                >
                  {row.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            ))}
          </div>
        )}
      </LiquidGlass>
    </div>
  );
}
