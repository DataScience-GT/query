"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { FormChipSelect, FormMultiChipSelect } from "@query/ui/FormChipSelect";
import { FormInput } from "@query/ui/FormInput";
import { FormTextarea } from "@query/ui/FormTextarea";
import { Checkbox } from "@query/ui/Checkbox";
import { StepProgress } from "@query/ui/StepProgress";
import {
  StepContainer,
  FormErrorAlert,
  FormNavigation,
} from "@/components/hackathon/FormComponents";
import { DIETARY_OPTIONS } from "@/components/hackathon/constants";
import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_ROLES,
  VOLUNTEER_SHIRT_SIZES,
  VOLUNTEER_TOPICS,
  isInPerson,
  isOnline,
} from "@query/db/constants";
import type {
  VolunteerAffiliation,
  VolunteerAnswers,
  VolunteerBlock,
  VolunteerMode,
  VolunteerOnlineBlock,
  VolunteerRole,
  VolunteerTopic,
} from "@query/db/constants";
import {
  volunteerBlockGroups,
  volunteerOnlineBlockGroups,
} from "@/lib/volunteer-blocks";
import { volunteerVenue } from "@/lib/volunteer-venue";
import { isHacklyticsName } from "@/lib/hackathon-slug";

// "Other" is stored in the same list as the chips, as "Other: <what they
// typed>", the way the hacker form keeps it.
const DIETARY_OTHER = "Other";
const DIETARY_OTHER_PREFIX = "Other: ";

const splitDietary = (saved: readonly string[]) => ({
  chips: saved.map((d) => (d.startsWith(DIETARY_OTHER_PREFIX) ? DIETARY_OTHER : d)),
  other:
    saved
      .find((d) => d.startsWith(DIETARY_OTHER_PREFIX))
      ?.slice(DIETARY_OTHER_PREFIX.length) ?? "",
});

const PHONE_SHAPE = /^[0-9+().\s-]*$/;

/** A multi-select over `{ id, label }` items, in the labels people read. */
function byLabel<T extends string>(
  items: readonly { id: T; label: string }[],
  ids: readonly T[],
  set: (ids: T[]) => void,
) {
  return {
    options: items.map((item) => item.label),
    selected: items.filter((i) => ids.includes(i.id)).map((i) => i.label),
    onChange: (labels: string[]) =>
      set(items.filter((i) => labels.includes(i.label)).map((i) => i.id)),
  };
}

type StepId = "mode" | "venue" | "mentor" | "details";

type Props = {
  hackathon: {
    id: string;
    name: string;
    startDate: Date | string;
    location?: string | null;
  };
  /** The answers already saved, when editing or applying again. */
  saved?: VolunteerAnswers;
  /** True when a pending application is being corrected rather than made. */
  editing: boolean;
  onDone: () => void;
  onCancel: () => void;
};

/**
 * The volunteer application in short steps that depend on how the person
 * wants to help: in person asks about the venue weekend, an online mentor
 * about topics and hours online, and both asks each. Its state starts from
 * the saved answers when it mounts, so the page gives it a fresh `key`
 * instead of copying answers in with an effect.
 */
export function VolunteerForm({
  hackathon,
  saved,
  editing,
  onDone,
  onCancel,
}: Props) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  const savedVenue = saved && isInPerson(saved) ? saved : undefined;
  const savedMentor = saved && isOnline(saved) ? saved : undefined;

  const [mode, setMode] = useState<VolunteerMode | "">(saved?.mode ?? "");
  const [affiliation, setAffiliation] = useState<VolunteerAffiliation | "">(
    saved?.affiliation ?? "",
  );
  // The venue half.
  const [availability, setAvailability] = useState<VolunteerBlock[]>(
    savedVenue?.availability ?? [],
  );
  const [roles, setRoles] = useState<VolunteerRole[]>(savedVenue?.roles ?? []);
  const [experience, setExperience] = useState(savedVenue?.experience ?? "");
  const [shirtSize, setShirtSize] = useState<string>(savedVenue?.shirtSize ?? "");
  const start = splitDietary(savedVenue?.dietary ?? []);
  const [dietary, setDietary] = useState<string[]>(start.chips);
  const [dietaryOther, setDietaryOther] = useState(start.other);
  // The mentoring half.
  const [topics, setTopics] = useState<VolunteerTopic[]>(savedMentor?.topics ?? []);
  const [topicOther, setTopicOther] = useState(savedMentor?.topicOther ?? "");
  const [onlineAvailability, setOnlineAvailability] = useState<
    VolunteerOnlineBlock[]
  >(savedMentor?.onlineAvailability ?? []);
  const [mentorExperience, setMentorExperience] = useState(
    savedMentor?.mentorExperience ?? "",
  );
  // Both.
  const [phone, setPhone] = useState(saved?.phone ?? "");
  const [acknowledged, setAcknowledged] = useState(!!saved?.acknowledged);

  const finish = {
    onSuccess: async () => {
      await utils.volunteer.myApplication.invalidate({
        hackathonId: hackathon.id,
      });
      onDone();
    },
    onError: (e: Parameters<typeof trpcErrorMessage>[0]) =>
      setError(trpcErrorMessage(e, "That didn't save. Try again.")),
  };
  const submit = trpc.volunteer.submit.useMutation(finish);
  const update = trpc.volunteer.update.useMutation(finish);

  const bloom = isHacklyticsName(hackathon.name);
  const discord = bloom ? "the Hacklytics Discord" : "the event Discord";
  const venue = volunteerVenue(hackathon);

  const wantsVenue = mode === "in_person" || mode === "both";
  const wantsMentor = mode === "online" || mode === "both";
  const steps: { id: StepId; label: string }[] = [
    { id: "mode", label: "How you'll help" },
    ...(wantsVenue ? [{ id: "venue" as const, label: "In person" }] : []),
    ...(wantsMentor ? [{ id: "mentor" as const, label: "Online mentoring" }] : []),
    {
      id: "details",
      label: wantsVenue ? "Day-of details" : "Last details",
    },
  ];
  const current = steps[Math.min(step, steps.length - 1)]?.id ?? "mode";

  /** The first problem on a step, or null. The server holds the same rules. */
  function problemOn(id: StepId): string | null {
    if (id === "mode") {
      if (!mode) return "Choose how you want to help.";
      if (!affiliation) return "Choose what describes you.";
    }
    if (id === "venue" && availability.length === 0)
      return "Pick at least one time block you can cover.";
    if (id === "mentor") {
      if (topics.length === 0) return "Pick at least one topic you can help with.";
      if (topics.includes("other") && !topicOther.trim())
        return "Tell us which other topic you can help with.";
      if (onlineAvailability.length === 0)
        return "Pick at least one time you can be online.";
      if (!mentorExperience.trim()) return "Add a line about your experience.";
    }
    if (id === "details") {
      const given = phone.trim();
      if (wantsVenue) {
        if (!shirtSize) return "Choose a shirt size.";
        if (dietary.includes(DIETARY_OTHER) && !dietaryOther.trim())
          return "Tell us your dietary restriction.";
        if (given.length < 7)
          return "Enter a phone number we can reach on event days.";
      }
      // An online mentor may leave the phone blank, but not give half of one.
      if (given && !PHONE_SHAPE.test(given))
        return "Use digits, spaces and + ( ) - only in the phone number.";
      if (given && given.length < 7)
        return "That phone number looks too short.";
      if (!acknowledged)
        return "Confirm that you understand how volunteers are confirmed.";
    }
    return null;
  }

  function next() {
    const problem = problemOn(current);
    setError(problem ?? "");
    if (!problem) setStep(step + 1);
  }

  function back() {
    setError("");
    setStep(Math.max(step - 1, 0));
  }

  function send() {
    // Every step again, so a skipped one cannot reach the server half empty.
    for (const [index, { id }] of steps.entries()) {
      const problem = problemOn(id);
      if (problem) {
        setStep(index);
        setError(problem);
        return;
      }
    }
    setError("");
    if (!mode || !affiliation) return;

    // Only what the chosen way of helping asked, so changing your mind on the
    // first step never sends the other half's leftovers.
    const venueAnswers = {
      availability,
      roles,
      experience: experience.trim() || undefined,
      shirtSize: shirtSize as (typeof VOLUNTEER_SHIRT_SIZES)[number],
      dietary: dietary.map((d) =>
        d === DIETARY_OTHER ? `${DIETARY_OTHER_PREFIX}${dietaryOther.trim()}` : d,
      ),
    };
    const mentorAnswers = {
      topics,
      topicOther: topics.includes("other") ? topicOther.trim() : undefined,
      onlineAvailability,
      mentorExperience: mentorExperience.trim(),
    };
    const common = { affiliation, acknowledged: true as const };
    const answers =
      mode === "in_person"
        ? { mode, ...common, ...venueAnswers, phone: phone.trim() }
        : mode === "online"
          ? { mode, ...common, ...mentorAnswers, phone: phone.trim() || undefined }
          : { mode, ...common, ...venueAnswers, ...mentorAnswers, phone: phone.trim() };

    const input = { hackathonId: hackathon.id, answers };
    if (editing) update.mutate(input);
    else submit.mutate(input);
  }

  const modeChoices: { id: VolunteerMode; label: string; about: string }[] = [
    {
      id: "in_person",
      label: `In person at ${venue}`,
      about: `Run the weekend at ${venue}: check-in, meals, rooms and help for hackers.`,
    },
    {
      id: "online",
      label: "Online mentor",
      about: "Answer hackers' questions from wherever you are, for example in the Discord.",
    },
    {
      id: "both",
      label: "Both",
      about: `Take shifts at ${venue} and mentor online.`,
    },
  ];
  const chosen = modeChoices.find((m) => m.id === mode);
  const affiliationLabel =
    VOLUNTEER_AFFILIATIONS.find((a) => a.id === affiliation)?.label ?? "";
  const roleField = byLabel(VOLUNTEER_ROLES, roles, setRoles);
  const topicField = byLabel(VOLUNTEER_TOPICS, topics, setTopics);

  return (
    <div className="mt-10 max-w-3xl border-t border-[var(--border-subtle)] pt-6">
      <StepProgress steps={steps.map((s) => s.label)} current={step} />

      {current === "mode" && (
        <StepContainer title="How you'll help">
          <div>
            <FormChipSelect
              label="How do you want to help?"
              required
              options={modeChoices.map((m) => m.label)}
              value={chosen?.label ?? ""}
              onChange={(label) =>
                setMode(modeChoices.find((m) => m.label === label)?.id ?? "")
              }
            />
            {chosen && (
              <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
                {chosen.about}
              </p>
            )}
          </div>
          <FormChipSelect
            label="What describes you?"
            required
            options={VOLUNTEER_AFFILIATIONS.map((a) => a.label)}
            value={affiliationLabel}
            onChange={(label) =>
              setAffiliation(
                VOLUNTEER_AFFILIATIONS.find((a) => a.label === label)?.id ?? "",
              )
            }
          />
        </StepContainer>
      )}

      {current === "venue" && (
        <StepContainer title={`In person at ${venue}`}>
          <p className="text-[15px] text-[var(--text-muted)]">
            Pick every block you could cover. Organizers build shifts from these.
          </p>
          {volunteerBlockGroups(hackathon.startDate).map((group) => {
            const ids = group.blocks.map((b) => b.id);
            const field = byLabel(
              group.blocks.map((b) => ({ id: b.id, label: b.part })),
              availability,
              (picked) =>
                setAvailability([
                  ...availability.filter((id) => !ids.includes(id)),
                  ...picked,
                ]),
            );
            return (
              <FormMultiChipSelect
                key={group.day}
                label={group.heading}
                options={field.options}
                selected={field.selected}
                onChange={field.onChange}
              />
            );
          })}
          <div className="pt-2">
            <FormMultiChipSelect
              label="Roles you'd like"
              options={roleField.options}
              selected={roleField.selected}
              onChange={roleField.onChange}
            />
            <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
              Leave blank if you&apos;re happy to go where you&apos;re needed.
            </p>
          </div>
          <FormTextarea
            label="Volunteering or event experience (optional)"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="A career fair, a club event, a past hackathon. A line is plenty."
          />
        </StepContainer>
      )}

      {current === "mentor" && (
        <StepContainer title="Online mentoring">
          <div>
            <FormMultiChipSelect
              label="Topics you can help with"
              options={topicField.options}
              selected={topicField.selected}
              onChange={topicField.onChange}
            />
            <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
              Pick every one you would be glad to answer questions about.
            </p>
          </div>
          {topics.includes("other") && (
            <FormInput
              label="Your other topic"
              required
              value={topicOther}
              onChange={(e) => setTopicOther(e.target.value)}
              maxLength={60}
            />
          )}
          <p className="text-[15px] text-[var(--text-muted)]">
            When could you be online? All times are Eastern time. Pick every
            window you could be reachable.
          </p>
          {volunteerOnlineBlockGroups(hackathon.startDate).map((group) => {
            const ids = group.blocks.map((b) => b.id);
            const field = byLabel(
              group.blocks.map((b) => ({ id: b.id, label: b.part })),
              onlineAvailability,
              (picked) =>
                setOnlineAvailability([
                  ...onlineAvailability.filter((id) => !ids.includes(id)),
                  ...picked,
                ]),
            );
            return (
              <FormMultiChipSelect
                key={group.day}
                label={group.heading}
                options={field.options}
                selected={field.selected}
                onChange={field.onChange}
              />
            );
          })}
          <FormTextarea
            label="Your mentoring or technical experience"
            required
            value={mentorExperience}
            onChange={(e) => setMentorExperience(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Your work, classes or past mentoring. A line or two is plenty."
          />
        </StepContainer>
      )}

      {current === "details" && (
        <StepContainer title={wantsVenue ? "Day-of details" : "Last details"}>
          {wantsVenue && (
            <>
              <FormChipSelect
                label="Shirt size"
                required
                options={VOLUNTEER_SHIRT_SIZES}
                value={shirtSize}
                onChange={setShirtSize}
              />
              <FormMultiChipSelect
                label="Dietary restrictions"
                options={[...DIETARY_OPTIONS]}
                selected={dietary}
                onChange={setDietary}
                noneOption="None"
              />
              {dietary.includes(DIETARY_OTHER) && (
                <FormInput
                  label="Your dietary restriction"
                  required
                  value={dietaryOther}
                  onChange={(e) => setDietaryOther(e.target.value)}
                  maxLength={90}
                />
              )}
            </>
          )}
          <FormInput
            label={wantsVenue ? "Phone" : "Phone (optional)"}
            required={wantsVenue}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(404) 555-0142"
            hint="Only used to reach you during the event."
          />
          <Checkbox
            id="volunteer-acknowledged"
            checked={acknowledged}
            onChange={setAcknowledged}
            label={`I understand volunteers are confirmed by organizers and must join ${discord}.`}
          />
        </StepContainer>
      )}

      <FormErrorAlert message={error} />
      <FormNavigation
        step={step}
        totalSteps={steps.length}
        onBack={back}
        onNext={next}
        onSubmit={send}
        onCancel={onCancel}
        isSubmitting={submit.isPending || update.isPending}
        submitLabel={editing ? "Save changes" : "Apply to volunteer"}
      />
    </div>
  );
}
