"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ChevronLeft } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";

const JUDGE_REGISTRATION_STEPS = [
  "Hackathon Selection",
  "Personal Info",
  "Experience & Links",
  "Logistics",
];

export default function JudgeRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery({});
  const registerMutation = trpc.judge.register.useMutation({
    onSuccess: () => setSuccess(true),
    onError: (e) => setError(e.message),
  });

  // Form State
  const [hackathonId, setHackathonId] = useState("");
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

  if (isLoading) return <LoadingScreen message="Loading Hackathons..." />;

  // `closed` belongs here: closing participant registration is the natural step
  // *before* recruiting judges, and leaving it out emptied this page with no
  // explanation exactly when organisers were sending the link out.
  const activeHackathons =
    hackathons?.filter(
      (h) =>
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
      <div className="min-h-screen bg-[var(--bg-tertiary)] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-sm blur-[120px] pointer-events-none" />
        <LiquidGlass className="relative z-10 max-w-xl w-full p-12 text-center border border-accent/30 bg-white/[0.02]">
          <div className="w-20 h-20 bg-accent/10 border border-emerald-500/20 rounded-sm flex items-center justify-center mx-auto mb-8">
            <svg
              className="w-10 h-10 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-[var(--text-primary)] mb-4">
            Application Submitted
          </h2>
          <p className="text-[var(--text-primary)]/60 leading-relaxed mb-10">
            Thank you for applying to be a judge! Our organizing team will
            review your application and assign you to a track shortly. You will
            be notified via email once approved.
          </p>
          <Link
            href="/hackathons"
            className="px-8 py-4 bg-emerald-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]"
          >
            Return to Hub
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)] text-text-muted font-sans selection:bg-accent/30 overflow-x-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto py-24 px-6 md:px-12">
        <Link
          href="/hackathons"
          className="inline-flex items-center gap-2 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors text-sm font-medium mb-10 group"
        >
          <div className="p-1.5 rounded-sm bg-white/5 border border-[var(--border-subtle)] group-hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5 transform group-hover:-translate-x-0.5 transition-transform" />
          </div>
          Back to Hub
        </Link>

        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-[var(--text-primary)] tracking-tight mb-4">
            Judge Application
          </h1>
          <p className="text-base text-[var(--text-primary)]/50 max-w-2xl leading-relaxed">
            Join the mentor network. Help evaluate cutting-edge projects and
            guide the next generation of builders.
          </p>
        </div>

        <LiquidGlass className="p-8 md:p-12 border border-[var(--border-subtle)] bg-white/[0.01]">
          <StepProgress steps={JUDGE_REGISTRATION_STEPS} current={step} />

          {step === 0 && (
            <StepContainer title="Select a Hackathon">
              <p className="text-sm text-[var(--text-primary)]/60 mb-6">
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
                      className={`text-left p-6 border rounded-none transition-all ${
                        hackathonId === h.id
                          ? "bg-accent/10 border-accent/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                          : "bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-white/20"
                      }`}
                    >
                      <h3
                        className={`text-xl font-bold mb-2 ${hackathonId === h.id ? "text-accent" : "text-[var(--text-primary)]"}`}
                      >
                        {h.name}
                      </h3>
                      <p className="text-sm text-[var(--text-primary)]/50 line-clamp-2">
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
                  label="Core Specialty"
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
                  placeholder="https://linkedin.com/in/..."
                />
                <FormInput
                  label="GitHub URL"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
              <FormTextarea
                label="Previous Judging or Mentorship Experience"
                value={previousExperience}
                onChange={(e) => setPreviousExperience(e.target.value)}
                placeholder="Have you judged hackathons or mentored students before? Please briefly describe..."
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
                <p className="text-xs font-mono text-[var(--text-subtle)]">
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
