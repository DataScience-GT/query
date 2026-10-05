"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  sectionTitle,
} from "@/components/portal/ui";

/**
 * Comma-separated text to the array the API stores, or null when empty.
 *
 * Judge assignment matches these strings exactly, so entries are trimmed and
 * blanks dropped — a stray ", " would otherwise become a track no project can
 * ever be matched against.
 */
const splitList = (value: string): string[] | null => {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
};

export function CreateHackathonForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hackingStartTime, setHackingStartTime] = useState("");
  const [regDeadline, setRegDeadline] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [theme, setTheme] = useState("");
  // Set at creation so judge assignment has something to match on from the
  // start; the edit form can change them later.
  const [tracks, setTracks] = useState("");
  const [challenges, setChallenges] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "announced" | "open">("draft");
  const [error, setError] = useState("");

  const readOnly = useReadOnly();
  const createMutation = trpc.hackathon.create.useMutation({
    onSuccess: () => onCreated(),
    onError: (e) => setError(e.message),
  });

  function handleSubmit() {
    if (!name.trim() || !startDate || !endDate) {
      setError("Name, start date, and end date are required.");
      return;
    }
    setError("");
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      registrationDeadline: regDeadline ? new Date(regDeadline) : undefined,
      hackingStartTime: hackingStartTime
        ? new Date(hackingStartTime)
        : undefined,
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
      theme: theme.trim() || undefined,
      tracks: splitList(tracks) ?? undefined,
      challenges: splitList(challenges) ?? undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      status,
    });
  }

  return (
    <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className={sectionTitle}>New hackathon</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
        >
          Close
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label
            htmlFor="create-name"
            className={fieldLabel}
          >
            Name *
          </label>
          <input
            id="create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hacklytics 2026"
            className={input}
          />
        </div>

        <div>
          <label
            htmlFor="create-description"
            className={fieldLabel}
          >
            Description
          </label>
          <textarea
            id="create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this hackathon about?"
            rows={3}
            className={`resize-none ${input}`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="create-location"
              className={fieldLabel}
            >
              Location
            </label>
            <input
              id="create-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Klaus 1443"
              className={input}
            />
          </div>
          <div>
            <label
              htmlFor="create-theme"
              className={fieldLabel}
            >
              Theme
            </label>
            <input
              id="create-theme"
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Data for Good"
              className={input}
            />
          </div>

          <div>
            <label
              htmlFor="create-tracks"
              className={fieldLabel}
            >
              Tracks
            </label>
            <input
              id="create-tracks"
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
              htmlFor="create-challenges"
              className={fieldLabel}
            >
              Sponsor challenges
            </label>
            <input
              id="create-challenges"
              type="text"
              value={challenges}
              onChange={(e) => setChallenges(e.target.value)}
              placeholder="AWS, MongoDB, Capital One"
              className={input}
            />
          </div>

          <div>
            <label
              htmlFor="create-website"
              className={fieldLabel}
            >
              Website
            </label>
            <input
              id="create-website"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://hacklytics.io"
              className={input}
            />
          </div>

          <div>
            <label
              htmlFor="create-visibility"
              className={fieldLabel}
            >
              Visibility
            </label>
            <select
              id="create-visibility"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "draft" | "announced" | "open")
              }
              className={input}
            >
              <option value="draft">Draft — hidden, nobody can register</option>
              <option value="announced">
                Announced — public page and interest list, no registration
              </option>
              <option value="open">Open — registration live immediately</option>
            </select>
            <p className={fieldHint}>
              Announced is the safe way to publish months ahead: /hacklytics
              goes live and collects interest, but memberships and check-in keep
              pointing at the current edition until you switch this to Open.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--border-subtle)] pt-6">
          <h3 className={`mb-4 ${itemTitle}`}>Timing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            <div>
              <label
                htmlFor="create-start-date"
                className={fieldLabel}
              >
                Start date *
              </label>
              <input
                id="create-start-date"
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
                htmlFor="create-end-date"
                className={fieldLabel}
              >
                End date *
              </label>
              <input
                id="create-end-date"
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
                htmlFor="create-hacking-start-time"
                className={fieldLabel}
              >
                Hacking start time
              </label>
              <input
                id="create-hacking-start-time"
                type="datetime-local"
                value={hackingStartTime}
                onChange={(e) => setHackingStartTime(e.target.value)}
                className={input}
              />
              <p className={fieldHint}>
                Defaults to the start date; must fall within the event.
              </p>
            </div>
            <div>
              <label
                htmlFor="create-registration-deadline"
                className={fieldLabel}
              >
                Registration deadline
              </label>
              <input
                id="create-registration-deadline"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="create-max-participants"
              className={fieldLabel}
            >
              Max participants
            </label>
            <input
              id="create-max-participants"
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="Leave blank for no cap"
              className={input}
            />
            {/* This number counts APPLICATIONS, pending ones included — not
                people you have accepted. Setting it to your venue capacity
                closes registration before anyone has been reviewed. */}
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--warning)]">
              Counts applications, including unreviewed ones. Set it to your
              venue size and registration closes before you have accepted
              anyone. Leave blank and close registration by deadline instead.
            </p>
          </div>
          <div>{/* empty cell for layout */}</div>
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
            disabled={readOnly || createMutation.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {createMutation.isPending ? "Creating…" : "Create hackathon"}
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
    </section>
  );
}
