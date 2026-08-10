"use client";

import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { toInputDate } from "@/components/admin/hackathons/constants";

const HACKATHON_STATUSES = [
  "draft",
  "announced",
  "open",
  "closed",
  "in_progress",
  "completed",
  "cancelled",
] as const;

type HackathonStatus = (typeof HACKATHON_STATUSES)[number];

/**
 * Comma-separated text to the array the API stores, or null when emptied.
 *
 * Judge assignment matches these strings exactly, so entries are trimmed and
 * blanks dropped — a stray ", " would otherwise become a track that no project
 * can ever be matched against.
 */
const splitList = (value: string): string[] | null => {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
};

export function EditHackathonForm({
  hackathonId,
  onClose,
  onSaved,
}: {
  hackathonId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: hackathon, isLoading } = trpc.hackathon.getById.useQuery({
    id: hackathonId,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hackingStartTime, setHackingStartTime] = useState("");
  const [regDeadline, setRegDeadline] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [theme, setTheme] = useState("");
  const [status, setStatus] = useState<HackathonStatus>("draft");
  // Tracks and challenges decide which judges see which project, so they have
  // to be editable after creation — the setup wizard only wrote them once, at
  // create time, and InfoTab rendered all five of these as blank sections.
  const [tracks, setTracks] = useState("");
  const [challenges, setChallenges] = useState("");
  const [rules, setRules] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (hackathon && !loaded) {
      setName(hackathon.name);
      setDescription(hackathon.description || "");
      setLocation(hackathon.location || "");
      setStartDate(toInputDate(hackathon.startDate));
      setEndDate(toInputDate(hackathon.endDate));
      setHackingStartTime(
        hackathon.hackingStartTime
          ? toInputDate(hackathon.hackingStartTime)
          : "",
      );
      setRegDeadline(
        hackathon.registrationDeadline
          ? toInputDate(hackathon.registrationDeadline)
          : "",
      );
      setMaxParticipants(hackathon.maxParticipants?.toString() || "");
      setTheme(hackathon.theme || "");
      setTracks((hackathon.tracks ?? []).join(", "));
      setChallenges((hackathon.challenges ?? []).join(", "));
      setRules(hackathon.rules || "");
      setWebsiteUrl(hackathon.websiteUrl || "");
      setStatus(hackathon.status as HackathonStatus);
      setLoaded(true);
    }
  }, [hackathon, loaded]);

  const updateMutation = trpc.hackathon.update.useMutation({
    onSuccess: () => onSaved(),
    onError: (e) => setError(e.message),
  });

  // Escape closes the dialog. The backdrop handles pointers; this covers keyboards.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError("");
    updateMutation.mutate({
      id: hackathonId,
      name: name.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      hackingStartTime: hackingStartTime ? new Date(hackingStartTime) : null,
      registrationDeadline: regDeadline ? new Date(regDeadline) : undefined,
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
      theme: theme.trim() || undefined,
      // null, not undefined, when emptied: undefined means "leave unchanged",
      // so a field that was set could otherwise never be cleared.
      tracks: splitList(tracks),
      challenges: splitList(challenges),
      rules: rules.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
      status,
    });
  }

  if (isLoading || !hackathon) {
    return (
      <LiquidGlass className="p-6 mb-6">
        <p className="text-gray-600 font-mono text-sm animate-pulse">
          Loading hackathon...
        </p>
      </LiquidGlass>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Decorative backdrop. Clicking it closes the modal, but it is not a
          control — keyboard users get Escape instead (see the effect above). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--bg-primary)]/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-hackathon-title"
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <LiquidGlass className="p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
          <div className="flex items-center justify-between mb-6">
            <h3
              id="edit-hackathon-title"
              className="text-lg font-bold text-[var(--text-primary)]"
            >
              Edit Hackathon
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit hackathon dialog"
              className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors text-sm font-mono"
            >
              X
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="edit-status"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Status
              </label>
              <select
                id="edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as HackathonStatus)}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
              >
                {HACKATHON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {status !== "open" && (
                <p className="text-[11px] text-amber-400/80 mt-2 font-mono">
                  Participants can only register while status is
                  &quot;open&quot;.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-name"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Name
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="edit-description"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Description
              </label>
              <textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="edit-location"
                  className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                >
                  Location
                </label>
                <input
                  id="edit-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-theme"
                  className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                >
                  Theme
                </label>
                <input
                  id="edit-theme"
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-primary)] mb-4 font-mono opacity-80">
                Judging &amp; Info
              </p>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="edit-tracks"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Tracks
                  </label>
                  <input
                    id="edit-tracks"
                    type="text"
                    value={tracks}
                    onChange={(e) => setTracks(e.target.value)}
                    placeholder="AI, Healthcare, Finance"
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                  />
                  <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-1">
                    Comma separated. Teams pick from these when they submit, and
                    judges are matched on them.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="edit-challenges"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Sponsor Challenges
                  </label>
                  <input
                    id="edit-challenges"
                    type="text"
                    value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    placeholder="AWS, MongoDB, Capital One"
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-website"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Website URL
                  </label>
                  <input
                    id="edit-website"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://hacklytics.io"
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-rules"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Rules
                  </label>
                  <textarea
                    id="edit-rules"
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    rows={5}
                    maxLength={10000}
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors resize-y"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-primary)] mb-4 font-mono opacity-80">
                Timing
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label
                    htmlFor="edit-start-date"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Start Date
                  </label>
                  <input
                    id="edit-start-date"
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">
                    Event doors open / schedule begins
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="edit-end-date"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    End Date
                  </label>
                  <input
                    id="edit-end-date"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">
                    Event closes / everyone leaves
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="edit-hacking-start-time"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Hacking Start Time
                  </label>
                  <input
                    id="edit-hacking-start-time"
                    type="datetime-local"
                    value={hackingStartTime}
                    onChange={(e) => setHackingStartTime(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">
                    Defaults to Start Date; must be within event window. Clear
                    to reset.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="edit-registration-deadline"
                    className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                  >
                    Registration Deadline
                  </label>
                  <input
                    id="edit-registration-deadline"
                    type="datetime-local"
                    value={regDeadline}
                    onChange={(e) => setRegDeadline(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">
                    Last chance for participants to sign up.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-max-participants"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Max Participants
              </label>
              <input
                id="edit-max-participants"
                type="number"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                placeholder="Leave blank for no cap"
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
              />
              {/* Counts APPLICATIONS, pending included — not acceptances. */}
              <p className="text-[10px] font-mono text-amber-300/80 mt-1 leading-relaxed">
                Counts applications, including unreviewed ones. Set it to your
                venue size and registration closes before you have accepted
                anyone. Leave blank and close registration by deadline instead.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-none">
                <p className="text-red-400 text-sm font-mono">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={updateMutation.isPending}
                className="px-6 py-3 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-[4px_4px_0_0_var(--accent)] disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 text-[var(--text-subtle)] hover:text-[var(--text-primary)] text-sm font-mono transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </LiquidGlass>
      </div>
    </div>
  );
}
