"use client";

import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  meta,
  object,
  sectionTitle,
} from "@/components/portal/ui";
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

  // Seed the form once, during render rather than in an effect, so the empty
  // form never paints.
  if (hackathon && !loaded) {
    setName(hackathon.name);
    setDescription(hackathon.description || "");
    setLocation(hackathon.location || "");
    setStartDate(toInputDate(hackathon.startDate));
    setEndDate(toInputDate(hackathon.endDate));
    setHackingStartTime(
      hackathon.hackingStartTime ? toInputDate(hackathon.hackingStartTime) : "",
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
      <p className={`mt-6 ${meta}`}>Loading hackathon…</p>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Decorative backdrop. Clicking it closes the modal, but it is not a
          control — keyboard users get Escape instead (see the effect above). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--bg-primary)]/80"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-hackathon-title"
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className={`${object} p-6`}>
          <div className="flex items-baseline justify-between mb-6">
            <h3
              id="edit-hackathon-title"
              className={sectionTitle}
            >
              Edit hackathon
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit hackathon dialog"
              className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
            >
              Close
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <label
                htmlFor="edit-status"
                className={fieldLabel}
              >
                Status
              </label>
              <select
                id="edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as HackathonStatus)}
                className={input}
              >
                {HACKATHON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
                  </option>
                ))}
              </select>
              {status !== "open" && (
                <p className="mt-1.5 text-[13px] text-[var(--warning)]">
                  Participants can only register while status is
                  &quot;open&quot;.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-name"
                className={fieldLabel}
              >
                Name
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="edit-description"
                className={fieldLabel}
              >
                Description
              </label>
              <textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`resize-none ${input}`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="edit-location"
                  className={fieldLabel}
                >
                  Location
                </label>
                <input
                  id="edit-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={input}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-theme"
                  className={fieldLabel}
                >
                  Theme
                </label>
                <input
                  id="edit-theme"
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className={input}
                />
              </div>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-5">
              <h4 className={`mb-4 ${itemTitle}`}>Judging and info</h4>
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="edit-tracks"
                    className={fieldLabel}
                  >
                    Tracks
                  </label>
                  <input
                    id="edit-tracks"
                    type="text"
                    value={tracks}
                    onChange={(e) => setTracks(e.target.value)}
                    placeholder="AI, Healthcare, Finance"
                    className={input}
                  />
                  <p className={fieldHint}>
                    Comma separated. Teams pick from these when they submit, and
                    judges are matched on them.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="edit-challenges"
                    className={fieldLabel}
                  >
                    Sponsor challenges
                  </label>
                  <input
                    id="edit-challenges"
                    type="text"
                    value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    placeholder="AWS, MongoDB, Capital One"
                    className={input}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-website"
                    className={fieldLabel}
                  >
                    Website
                  </label>
                  <input
                    id="edit-website"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://hacklytics.io"
                    className={input}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-rules"
                    className={fieldLabel}
                  >
                    Rules
                  </label>
                  <textarea
                    id="edit-rules"
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    rows={5}
                    maxLength={10000}
                    className={`resize-y ${input}`}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-5">
              <h4 className={`mb-4 ${itemTitle}`}>Timing</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <div>
                  <label
                    htmlFor="edit-start-date"
                    className={fieldLabel}
                  >
                    Start date
                  </label>
                  <input
                    id="edit-start-date"
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={input}
                  />
                  <p className={fieldHint}>
                    When doors open and the schedule begins.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="edit-end-date"
                    className={fieldLabel}
                  >
                    End date
                  </label>
                  <input
                    id="edit-end-date"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={input}
                  />
                  <p className={fieldHint}>
                    When the event closes.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label
                    htmlFor="edit-hacking-start-time"
                    className={fieldLabel}
                  >
                    Hacking start time
                  </label>
                  <input
                    id="edit-hacking-start-time"
                    type="datetime-local"
                    value={hackingStartTime}
                    onChange={(e) => setHackingStartTime(e.target.value)}
                    className={input}
                  />
                  <p className={fieldHint}>
                    Defaults to the start date; must fall within the event. Clear
                    to reset.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="edit-registration-deadline"
                    className={fieldLabel}
                  >
                    Registration deadline
                  </label>
                  <input
                    id="edit-registration-deadline"
                    type="datetime-local"
                    value={regDeadline}
                    onChange={(e) => setRegDeadline(e.target.value)}
                    className={input}
                  />
                  <p className={fieldHint}>
                    Last chance for participants to sign up.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-max-participants"
                className={fieldLabel}
              >
                Max participants
              </label>
              <input
                id="edit-max-participants"
                type="number"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                placeholder="Leave blank for no cap"
                className={input}
              />
              {/* Counts APPLICATIONS, pending included — not acceptances. */}
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--warning)]">
                Counts applications, including unreviewed ones. Set it to your
                venue size and registration closes before you have accepted
                anyone. Leave blank and close registration by deadline instead.
              </p>
            </div>

            {error && (
              <div>
                <p role="alert" className="text-[15px] text-[var(--danger)]">{error}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={updateMutation.isPending}
                className={btnPrimary}
              >
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className={btnSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
