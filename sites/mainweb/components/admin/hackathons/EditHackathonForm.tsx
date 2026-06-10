"use client";

import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { toInputDate } from "@/components/admin/hackathons/constants";

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
      setLoaded(true);
    }
  }, [hackathon, loaded]);

  const updateMutation = trpc.hackathon.update.useMutation({
    onSuccess: () => onSaved(),
    onError: (e) => setError(e.message),
  });

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
      <div
        className="absolute inset-0 bg-[var(--bg-primary)]/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <LiquidGlass className="p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              Edit Hackathon
            </h3>
            <button
              onClick={onClose}
              className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors text-sm font-mono"
            >
              X
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
                  Theme
                </label>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-primary)] mb-4 font-mono opacity-80">Timing</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">Start Date</label>
                  <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]" />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">Event doors open / schedule begins</p>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">End Date</label>
                  <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]" />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">Event closes / everyone leaves</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">Hacking Start Time</label>
                  <input type="datetime-local" value={hackingStartTime} onChange={(e) => setHackingStartTime(e.target.value)} className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]" />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">Defaults to Start Date; must be within event window. Clear to reset.</p>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">Registration Deadline</label>
                  <input type="datetime-local" value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]" />
                  <p className="mt-1 text-xs text-[var(--text-subtle)] font-mono">Last chance for participants to sign up.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono">
                Max Participants
              </label>
              <input
                type="number"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-none">
                <p className="text-red-400 text-sm font-mono">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSubmit}
                disabled={updateMutation.isPending}
                className="px-6 py-3 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-[4px_4px_0_0_var(--accent)] disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
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
