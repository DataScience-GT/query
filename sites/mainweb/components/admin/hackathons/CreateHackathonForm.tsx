"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

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
  const [status, setStatus] = useState<"draft" | "announced" | "open">("draft");
  const [error, setError] = useState("");

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
      status,
    });
  }

  return (
    <LiquidGlass className="p-6 mb-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">
          New Hackathon
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors text-sm font-mono"
        >
          X
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="create-name"
            className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
          >
            Name *
          </label>
          <input
            id="create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hacklytics 2026"
            className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="create-description"
            className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
          >
            Description
          </label>
          <textarea
            id="create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this hackathon about?"
            rows={3}
            className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="create-location"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Location
            </label>
            <input
              id="create-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Klaus 1443"
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="create-theme"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Theme
            </label>
            <input
              id="create-theme"
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Data for Good"
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="create-visibility"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Visibility
            </label>
            <select
              id="create-visibility"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "draft" | "announced" | "open")
              }
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
            >
              <option value="draft">Draft — hidden, nobody can register</option>
              <option value="announced">
                Announced — public page and interest list, no registration
              </option>
              <option value="open">Open — registration live immediately</option>
            </select>
            <p className="text-[11px] text-[var(--text-subtle)] mt-2 font-mono">
              Announced is the safe way to publish months ahead: /hacklytics
              goes live and collects interest, but memberships and check-in keep
              pointing at the current edition until you switch this to Open.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4 font-mono uppercase tracking-widest opacity-80">
            Timing
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label
                htmlFor="create-start-date"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Start Date *
              </label>
              <input
                id="create-start-date"
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
                htmlFor="create-end-date"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                End Date *
              </label>
              <input
                id="create-end-date"
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
                htmlFor="create-hacking-start-time"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Hacking Start Time
              </label>
              <input
                id="create-hacking-start-time"
                type="datetime-local"
                value={hackingStartTime}
                onChange={(e) => setHackingStartTime(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]"
              />
              <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">
                Defaults to Start Date; must be within event window.
              </p>
            </div>
            <div>
              <label
                htmlFor="create-registration-deadline"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Registration Deadline
              </label>
              <input
                id="create-registration-deadline"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="create-max-participants"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Max Participants
            </label>
            <input
              id="create-max-participants"
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="500"
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>
          <div>{/* empty cell for layout */}</div>
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
            disabled={createMutation.isPending}
            className="px-6 py-3 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-[4px_4px_0_0_var(--accent)] disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create Hackathon"}
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
  );
}
