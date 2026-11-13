"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { Alert } from "@query/ui/Alert";
import {
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  sectionTitle,
} from "@query/ui/classes";
import { FormInput } from "@query/ui/FormInput";
import { FormTextarea } from "@query/ui/FormTextarea";
import { localTimeZone } from "@/components/admin/hackathons/constants";

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
  /** The new row, so the caller can open its dashboard. */
  onCreated: (hackathon: { id: string; name: string }) => void;
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
    onSuccess: (row) => onCreated(row),
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
        <FormInput
          label="Name *"
          id="create-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hacklytics 2026"
        />

        <FormTextarea
          label="Description"
          id="create-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this hackathon about?"
          rows={3}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormInput
            label="Location"
            id="create-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Klaus 1443"
          />
          <FormInput
            label="Theme"
            id="create-theme"
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Data for Good"
          />

          <FormInput
            label="Tracks"
            id="create-tracks"
            type="text"
            value={tracks}
            onChange={(e) => setTracks(e.target.value)}
            placeholder="AI, Healthcare, Finance"
            hint="Comma separated. Teams pick from these when they submit, and judges are matched on them."
          />

          <FormInput
            label="Sponsor challenges"
            id="create-challenges"
            type="text"
            value={challenges}
            onChange={(e) => setChallenges(e.target.value)}
            placeholder="AWS, MongoDB, Capital One"
          />

          <FormInput
            label="Website"
            id="create-website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://hacklytics.io"
          />

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
          <h3 className={`mb-1 ${itemTitle}`}>Timing</h3>
          <p className={`mb-4 ${fieldHint}`}>
            Times are entered in your local time zone ({localTimeZone()}).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            <FormInput
              label="Start date *"
              id="create-start-date"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              hint="When doors open and the schedule begins."
            />
            <FormInput
              label="End date *"
              id="create-end-date"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              hint="When the event closes."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormInput
              label="Hacking start time"
              id="create-hacking-start-time"
              type="datetime-local"
              value={hackingStartTime}
              onChange={(e) => setHackingStartTime(e.target.value)}
              hint="Defaults to the start date; must fall within the event."
            />
            <FormInput
              label="Registration deadline"
              id="create-registration-deadline"
              type="datetime-local"
              value={regDeadline}
              onChange={(e) => setRegDeadline(e.target.value)}
              hint="Last chance for participants to sign up."
            />
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
            {/* The cap counts SEATS: approved and checked-in people only
                (syncCurrentParticipants). Pending applications do not use one. */}
            <p className={fieldHint}>
              Caps accepted people, not applications. Pending applications do
              not count, so you can take more applications than seats and
              accept in waves until the cap is reached. Leave blank for no cap.
            </p>
          </div>
          <div>{/* empty cell for layout */}</div>
        </div>

        {error && (
          <div>
            <Alert>{error}</Alert>
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
