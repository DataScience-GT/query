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
} from "@query/db/constants";
import type {
  VolunteerAffiliation,
  VolunteerAnswers,
  VolunteerBlock,
  VolunteerRole,
} from "@query/db/constants";
import { volunteerBlockGroups } from "@/lib/volunteer-blocks";
import { isHacklyticsName } from "@/lib/hackathon-slug";

const STEPS = ["About you", "Your weekend", "Day-of details"];

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

type Props = {
  hackathon: { id: string; name: string; startDate: Date | string };
  /** The answers already saved, when editing or applying again. */
  saved?: VolunteerAnswers;
  /** True when a pending application is being corrected rather than made. */
  editing: boolean;
  onDone: () => void;
  onCancel: () => void;
};

/**
 * The volunteer application in three short steps. Its state starts from the
 * saved answers when it mounts, so the page gives it a fresh `key` instead of
 * copying answers in with an effect.
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

  const [affiliation, setAffiliation] = useState<VolunteerAffiliation | "">(
    saved?.affiliation ?? "",
  );
  const [experience, setExperience] = useState(saved?.experience ?? "");
  const [availability, setAvailability] = useState<VolunteerBlock[]>(
    saved?.availability ?? [],
  );
  const [roles, setRoles] = useState<VolunteerRole[]>(saved?.roles ?? []);
  const [shirtSize, setShirtSize] = useState<string>(saved?.shirtSize ?? "");
  const start = splitDietary(saved?.dietary ?? []);
  const [dietary, setDietary] = useState<string[]>(start.chips);
  const [dietaryOther, setDietaryOther] = useState(start.other);
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

  const discord = isHacklyticsName(hackathon.name)
    ? "the Hacklytics Discord"
    : "the event Discord";

  /** The first problem on a step, or null. */
  function problemOn(s: number): string | null {
    if (s === 0 && !affiliation) return "Choose what describes you.";
    if (s === 1 && availability.length === 0)
      return "Pick at least one time block you can cover.";
    if (s === 2) {
      if (!shirtSize) return "Choose a shirt size.";
      if (dietary.includes(DIETARY_OTHER) && !dietaryOther.trim())
        return "Tell us your dietary restriction.";
      if (phone.trim().length < 7)
        return "Enter a phone number we can reach on event days.";
      if (!/^[0-9+().\s-]+$/.test(phone.trim()))
        return "Use digits, spaces and + ( ) - only in the phone number.";
      if (!acknowledged)
        return "Confirm that you understand how volunteers are confirmed.";
    }
    return null;
  }

  function next() {
    const problem = problemOn(step);
    setError(problem ?? "");
    if (!problem) setStep(step + 1);
  }

  function back() {
    setError("");
    setStep(Math.max(step - 1, 0));
  }

  function send() {
    // Every step again, so a skipped one cannot reach the server half empty.
    for (let s = 0; s < STEPS.length; s++) {
      const problem = problemOn(s);
      if (problem) {
        setStep(s);
        setError(problem);
        return;
      }
    }
    setError("");
    const answers = {
      affiliation: affiliation as VolunteerAffiliation,
      availability,
      roles,
      experience: experience.trim() || undefined,
      shirtSize: shirtSize as VolunteerAnswers["shirtSize"],
      dietary: dietary.map((d) =>
        d === DIETARY_OTHER ? `${DIETARY_OTHER_PREFIX}${dietaryOther.trim()}` : d,
      ),
      phone: phone.trim(),
      acknowledged: true as const,
    };
    const input = { hackathonId: hackathon.id, answers };
    if (editing) update.mutate(input);
    else submit.mutate(input);
  }

  const affiliationLabel =
    VOLUNTEER_AFFILIATIONS.find((a) => a.id === affiliation)?.label ?? "";
  const roleField = byLabel(VOLUNTEER_ROLES, roles, setRoles);

  return (
    <div className="mt-10 max-w-3xl border-t border-[var(--border-subtle)] pt-6">
      <StepProgress steps={STEPS} current={step} />

      {step === 0 && (
        <StepContainer title="About you">
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

      {step === 1 && (
        <StepContainer title="Your weekend">
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
        </StepContainer>
      )}

      {step === 2 && (
        <StepContainer title="Day-of details">
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
          <FormInput
            label="Phone"
            required
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
        totalSteps={STEPS.length}
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
