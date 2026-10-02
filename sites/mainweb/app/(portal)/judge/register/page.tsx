"use client";

import React, { useEffect, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
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
import { Check, ChevronLeft } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";

const JUDGE_REGISTRATION_STEPS = [
  "Hackathon Selection",
  "Personal Info",
  "Experience & Links",
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
        setError("Please select a hackathon to judge.");
        return false;
      }
    } else if (s === 1) {
      if (!name.trim()) {
        setError("Full name is required.");
        return false;
      }
      if (!email.trim() || !email.includes("@")) {
        setError("Valid email is required.");
        return false;
      }
      if (!company.trim()) {
        setError("Company/Organization is required.");
        return false;
      }
      if (!title.trim()) {
        setError("Title/Role is required.");
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
      <div className="min-h-screen bg-[var(--bg-tertiary)] flex items-center justify-center p-6">
        <LiquidGlass printed className="max-w-xl w-full p-6 md:p-10 text-center">
          <Check className="w-8 h-8 text-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-3">
            Application received
          </h2>
          {/* judge.setActive sends the approval email on the transition. */}
          <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-8">
            An organiser will review it and assign you a track. You&apos;ll get
            an email once you&apos;re approved.
          </p>
          <Link
            href="/hackathons"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
          >
            Back to hackathons
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link
            href="/hackathons"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent mb-4"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to hackathons
          </Link>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Apply to judge
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Pick an event, tell us about yourself, and choose a track. Takes
            about five minutes.
          </p>
        </div>

        <LiquidGlass printed className="p-6 md:p-8">
          <StepProgress steps={JUDGE_REGISTRATION_STEPS} current={step} />

          {step === 0 && (
            <StepContainer title="Select a Hackathon">
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Which event would you like to judge for?
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeHackathons.length === 0 ? (
                  <p className="text-sm text-amber-500 font-medium">
                    No open hackathons available for judging right now.
                  </p>
                ) : (
                  activeHackathons.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setHackathonId(h.id)}
                      className={`text-left p-5 border rounded-sm transition-ui ${
                        hackathonId === h.id
                          ? "bg-accent/10 border-accent/40"
                          : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                      }`}
                    >
                      <h3
                        className={`text-base font-bold mb-2 ${hackathonId === h.id ? "text-accent" : "text-[var(--text-primary)]"}`}
                      >
                        {h.name}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)] line-clamp-2">
                        {h.description}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </StepContainer>
          )}

          {step === 1 && (
            <StepContainer title="Personal Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormInput
                  label="Full Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
                <FormInput
                  label="Email Address"
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
                  label="Company / Organization"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                />
                <FormInput
                  label="Title / Role"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Senior Software Engineer"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormInput
                  label="Phone Number"
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
            <StepContainer title="Experience & Background">
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
                label="Previous Judging or Mentorship Experience"
                value={previousExperience}
                onChange={(e) => setPreviousExperience(e.target.value)}
                placeholder="Have you judged hackathons or mentored students before? Please briefly describe…"
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
            <StepContainer title="Logistics & Preferences">
              {/* The chosen edition's own labels, not free text: judging routes
                  on an exact string match, so a typed track that does not exist
                  filters the judge's pool to nothing. Leaving it unset means
                  "any project", which is a real and common answer. */}
              {trackOptions.length > 0 ? (
                <FormChipSelect
                  label="Preferred Track to Judge"
                  options={trackOptions}
                  value={preferredTrack}
                  onChange={setPreferredTrack}
                  allowDeselect
                />
              ) : (
                <p className="text-xs text-[var(--text-subtle)]">
                  This hackathon has no tracks published yet — organisers will
                  assign yours.
                </p>
              )}
              <div className="mt-6">
                <FormChipSelect
                  label="T-Shirt Size"
                  options={[...SHIRT_SIZES]}
                  value={shirtSize}
                  onChange={setShirtSize}
                  allowDeselect
                />
              </div>
              <div className="mt-6">
                <FormMultiChipSelect
                  label="Dietary Restrictions"
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
        </LiquidGlass>
      </div>
    </div>
  );
}
