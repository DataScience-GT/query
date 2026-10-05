"use client";

import React, { useEffect, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import {
  FormInput,
  FormTextarea,
  FormChipSelect,
  FormMultiChipSelect,
  StepProgress,
  StepContainer,
  FormErrorAlert,
  FormNavigation,
} from "@/components/hackathon/FormComponents";
import { SHIRT_SIZES, DIETARY_OPTIONS } from "@/components/hackathon/constants";
import Link from "next/link";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  body,
  btnSecondary,
  fieldHint,
  meta,
  page,
  pageDek,
  pageTitle,
} from "@/components/portal/ui";

const JUDGE_REGISTRATION_STEPS = [
  "Event",
  "About you",
  "Experience",
  "Logistics",
];

export default function JudgeRegisterPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery({});
  const utils = trpc.useUtils();
  const registerMutation = trpc.judge.register.useMutation({
    onSuccess: () => {
      setSuccess(true);
      // Or /judge still offers "Apply to Judge", which now throws "already
      // applied".
      void utils.judge.myApplications.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  // Form State
  // /judge links here with the edition already chosen; starting step 0 empty
  // made the judge pick it again.
  const searchParams = useSearchParams();
  const [hackathonId, setHackathonId] = useState(
    () => searchParams.get("hackathonId") ?? "",
  );
  const [preferredTrack, setPreferredTrack] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [previousExperience, setPreviousExperience] = useState("");
  const [whyJudge, setWhyJudge] = useState("");
  const [shirtSize, setShirtSize] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);

  // judge.register is protected, so an outside professional following a shared
  // link filled in all four steps and only then got "Not authenticated".
  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  if (authStatus === "loading" || authStatus === "unauthenticated") {
    return <LoadingScreen message="Checking your session…" />;
  }

  if (isLoading) return <LoadingScreen message="Loading hackathons…" />;

  // `closed` belongs here: closing participant registration is the natural step
  // *before* recruiting judges, and leaving it out emptied this page with no
  // explanation exactly when organisers were sending the link out.
  const activeHackathons =
    hackathons?.filter(
      // Announced too: judges are recruited before registration opens.
      (h) =>
        h.status === "announced" ||
        h.status === "open" ||
        h.status === "closed" ||
        h.status === "in_progress",
    ) || [];

  const selectedHackathon = activeHackathons.find((h) => h.id === hackathonId);
  const trackOptions = [
    ...(selectedHackathon?.tracks ?? []),
    ...(selectedHackathon?.challenges ?? []),
  ];

  function validateStep(s: number): boolean {
    setError("");
    if (s === 0) {
      if (!hackathonId) {
        setError("Pick a hackathon to judge.");
        return false;
      }
    } else if (s === 1) {
      if (!name.trim()) {
        setError("Enter your full name.");
        return false;
      }
      if (!email.trim() || !email.includes("@")) {
        setError("Enter a valid email address.");
        return false;
      }
      if (!company.trim()) {
        setError("Enter your company or organisation.");
        return false;
      }
      if (!title.trim()) {
        setError("Enter your title or role.");
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, JUDGE_REGISTRATION_STEPS.length - 1));
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleSubmit() {
    if (!validateStep(3)) return;
    setError("");
    registerMutation.mutate({
      hackathonId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      company: company.trim(),
      title: title.trim(),
      specialty: specialty.trim() || undefined,
      linkedinUrl: linkedinUrl.trim() || undefined,
      githubUrl: githubUrl.trim() || undefined,
      previousExperience: previousExperience.trim() || undefined,
      whyJudge: whyJudge.trim() || undefined,
      shirtSize: shirtSize || undefined,
      dietaryRestrictions: dietary.length ? dietary : undefined,
      preferredTrack: preferredTrack || undefined,
    });
  }

  if (success) {
    return (
      <main className={page}>
        <div className="max-w-xl">
          <h1 className={pageTitle}>Application received</h1>
          {/* judge.setActive sends the approval email on the transition. */}
          <p className={pageDek}>
            An organiser will review it and assign you a track. You&apos;ll get
            an email once you&apos;re approved.
          </p>
          <Link href="/hackathons" className={`mt-8 ${btnSecondary}`}>
            Back to hackathons
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={page}>
      <Link
        href="/hackathons"
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← All hackathons
      </Link>

      <header className="mt-6">
        <h1 className={pageTitle}>Apply to judge</h1>
        <p className={pageDek}>
          Pick an event, tell us about yourself, and choose a track. Takes
          about five minutes.
        </p>
      </header>

      <div className="mt-10 max-w-3xl border-t border-[var(--border-subtle)] pt-6">
        <StepProgress steps={JUDGE_REGISTRATION_STEPS} current={step} />

        {step === 0 && (
          <StepContainer title="Which event will you judge?">
            {activeHackathons.length === 0 ? (
              <p className={body}>
                No hackathons are taking judge applications right now. Check
                back closer to the next event.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeHackathons.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={hackathonId === h.id}
                    onClick={() => setHackathonId(h.id)}
                    className={`rounded-[var(--radius-md)] border text-left p-5 min-h-11 transition-colors ${
                      hackathonId === h.id
                        ? "border-accent bg-[var(--accent-dim)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    <span className="block text-[17px] font-semibold text-[var(--text-primary)]">
                      {h.name}
                    </span>
                    {h.description && (
                      <span className={`mt-1 block line-clamp-2 ${meta}`}>
                        {h.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </StepContainer>
        )}

        {step === 1 && (
          <StepContainer title="About you">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormInput
                label="Full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
              <FormInput
                label="Email"
                required
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormInput
                label="Company or organisation"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
              />
              <FormInput
                label="Title or role"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Software Engineer"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormInput
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
              <FormInput
                label="Specialty"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g. AI, Web3, Design, Product"
              />
            </div>
          </StepContainer>
        )}

        {step === 2 && (
          <StepContainer title="Experience">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormInput
                label="LinkedIn URL"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
              <FormInput
                label="GitHub URL"
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/…"
              />
            </div>
            <FormTextarea
              label="Judging or mentoring you have done"
              value={previousExperience}
              onChange={(e) => setPreviousExperience(e.target.value)}
              placeholder="Hackathons you have judged, students you have mentored…"
              rows={3}
            />
            <FormTextarea
              label="Why do you want to judge?"
              value={whyJudge}
              onChange={(e) => setWhyJudge(e.target.value)}
              placeholder="What excites you about being a judge for this event?"
              rows={3}
            />
          </StepContainer>
        )}

        {step === 3 && (
          <StepContainer title="Logistics">
            {/* The chosen edition's own labels, not free text: judging routes
                on an exact string match, so a typed track that does not exist
                filters the judge's pool to nothing. Leaving it unset means
                "any project", which is a real and common answer. */}
            {trackOptions.length > 0 ? (
              <FormChipSelect
                label="Track you would like to judge"
                options={trackOptions}
                value={preferredTrack}
                onChange={setPreferredTrack}
                allowDeselect
              />
            ) : (
              <p className={fieldHint}>
                This hackathon has no tracks published yet. An organiser will
                assign yours.
              </p>
            )}
            <div className="mt-6">
              <FormChipSelect
                label="T-shirt size"
                options={[...SHIRT_SIZES]}
                value={shirtSize}
                onChange={setShirtSize}
                allowDeselect
              />
            </div>
            <div className="mt-6">
              <FormMultiChipSelect
                label="Dietary restrictions"
                options={[...DIETARY_OPTIONS]}
                selected={dietary}
                onChange={setDietary}
                noneOption="None"
              />
            </div>
          </StepContainer>
        )}

        <FormErrorAlert message={error} />
        <FormNavigation
          step={step}
          totalSteps={JUDGE_REGISTRATION_STEPS.length}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/hackathons")}
          isSubmitting={registerMutation.isPending}
        />
      </div>
    </main>
  );
}
