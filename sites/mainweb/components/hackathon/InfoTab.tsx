"use client";

import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatPhoneAsTyped, normalizePhone, phoneDigits } from "@/lib/phone";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import {
  FormInput,
  FormTextarea,
  FormChipSelect,
  FormMultiChipSelect,
  SearchableSelect,
  StepProgress,
  StepContainer,
  FormErrorAlert,
  FormNavigation,
} from "@/components/hackathon/FormComponents";
import {
  SHIRT_SIZES,
  DIETARY_OPTIONS,
  LEVELS_OF_STUDY,
  GENDERS,
  REGISTRATION_STEPS,
  SCHOOLS,
  MAJORS,
} from "@/components/hackathon/constants";
import type { ShirtSize, LevelOfStudy } from "@/components/hackathon/constants";
import { InterestForm } from "@/components/hackathon/InterestForm";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { Clock, ExternalLink } from "lucide-react";
import Link from "next/link";

type RegistrationStep = 0 | 1 | 2 | 3;

const STATUS_LINE: Record<string, string> = {
  pending: "Waiting on review.",
  approved:
    "You're accepted. Your check-in pass is on the Schedule & pass tab.",
  waitlisted: "Waitlisted. You'll get a pass if a spot opens.",
  checked_in: "You're checked in.",
  rejected: "Your registration wasn't accepted this time.",
};

// Statuses that can still back out. checked_in is on site and rejected has
// nothing to withdraw; the server refuses both anyway.
const WITHDRAWABLE = new Set(["pending", "approved", "waitlisted"]);

// Relative to now so the range never goes stale: last year's grads up to an
// incoming first-year's eight-year horizon.
const CURRENT_YEAR = new Date().getFullYear();
const MIN_GRAD_YEAR = CURRENT_YEAR - 1;
const MAX_GRAD_YEAR = CURRENT_YEAR + 8;

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InfoTab({
  hackathon,
  isRegistered,
  myReg,
}: {
  hackathon: {
    id: string;
    name: string;
    description?: string | null;
    prizes?: { place: string; amount: number; description?: string }[] | null;
    rules?: string | null;
    registrationDeadline?: string | Date | null;
    websiteUrl?: string | null;
    status: string;
    maxParticipants?: number | null;
    currentParticipants: number;
    theme?: string | null;
  };
  isRegistered: boolean;
  myReg?: { registrationStatus: string; teamId?: string | null } | null;
}) {
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState<RegistrationStep>(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // Step 1: Personal Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [race, setRace] = useState("");
  const [underrepresented, setUnderrepresented] = useState(false);

  // Step 2: Academic
  // 12k schools / ~450KB, so it loads on the academic step rather than in the
  // bundle. A failed fetch leaves the short list, which still works.
  const [schoolOptions, setSchoolOptions] =
    useState<readonly string[]>(SCHOOLS);
  const [school, setSchool] = useState("");
  const [major, setMajor] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [levelOfStudy, setLevelOfStudy] = useState("");
  const [country, setCountry] = useState("United States");
  const [firstGeneration, setFirstGeneration] = useState(false);

  // Step 3: Experience
  const [hackathonsAttended, setHackathonsAttended] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [whyAttend, setWhyAttend] = useState("");

  // Step 4: Logistics
  const [shirtSize, setShirtSize] = useState<ShirtSize | "">("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [needsHardware, setNeedsHardware] = useState(false);
  const [agreeToCoC, setAgreeToCoC] = useState(false);
  const [mlhCodeOfConduct, setMlhCodeOfConduct] = useState(false);
  const [mlhDataSharing, setMlhDataSharing] = useState(false);
  const [mlhInformationalEmails, setMlhInformationalEmails] = useState(false);

  useEffect(() => {
    if (step !== 1 || schoolOptions !== SCHOOLS) return;
    let cancelled = false;
    fetch("/schools.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((list: string[]) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setSchoolOptions(list);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, schoolOptions]);

  const utils = trpc.useUtils();
  const registerMutation = trpc.hackathon.register.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setShowForm(false);
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.list.invalidate();
      utils.hackathon.getById.invalidate({ id: hackathon.id });
    },
    onError: (e) => setError(e.message),
  });

  const withdrawMutation = trpc.hackathon.withdrawRegistration.useMutation({
    onSuccess: () => {
      setConfirmWithdraw(false);
      setWithdrawError("");
      // success would otherwise keep the registered view up after this
      // session's own registration is withdrawn.
      setSuccess(false);
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({
        hackathonId: hackathon.id,
      });
      utils.hackathon.list.invalidate();
      utils.hackathon.getById.invalidate({ id: hackathon.id });
    },
    onError: (e) => setWithdrawError(e.message),
  });

  const isFull = !!(
    hackathon.maxParticipants &&
    hackathon.currentParticipants >= hackathon.maxParticipants
  );
  const deadlinePassed = !!(
    hackathon.registrationDeadline &&
    new Date(hackathon.registrationDeadline) < new Date()
  );
  // Full no longer blocks applying: capacity counts accepted people only, and
  // organisers waitlist anyone past it.
  const canRegister =
    hackathon.status === "open" && !isRegistered && !deadlinePassed;
  // A fresh registration starts pending; myReg lags a refetch behind success.
  const regStatus = myReg?.registrationStatus ?? "pending";

  function validateStep(s: RegistrationStep): boolean {
    setError("");
    if (s === 0) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First and last name are required.");
        return false;
      }
      if (!phone.trim()) {
        setError("Phone number is required.");
        return false;
      }
      if (phoneDigits(phone).length < 10) {
        setError("Please enter a complete phone number.");
        return false;
      }
      if (!age || parseInt(age) < 13 || parseInt(age) > 120) {
        setError("Please enter a valid age (13-120).");
        return false;
      }
    } else if (s === 1) {
      if (!school.trim()) {
        setError("School / university is required.");
        return false;
      }
      if (!major.trim()) {
        setError("Major / field of study is required.");
        return false;
      }
      if (
        !graduationYear ||
        parseInt(graduationYear) < MIN_GRAD_YEAR ||
        parseInt(graduationYear) > MAX_GRAD_YEAR
      ) {
        setError("Please enter a valid graduation year.");
        return false;
      }
      if (!levelOfStudy) {
        setError("Level of study is required.");
        return false;
      }
      if (!country.trim()) {
        setError("Country is required.");
        return false;
      }
    } else if (s === 2) {
      if (!whyAttend.trim()) {
        setError("Please tell us why you want to attend.");
        return false;
      }
    } else if (s === 3) {
      if (!agreeToCoC) {
        setError("You must agree to the Code of Conduct.");
        return false;
      }
      if (!mlhCodeOfConduct) {
        setError("You must agree to the MLH Code of Conduct.");
        return false;
      }
      if (!mlhDataSharing) {
        setError("You must agree to the MLH Data Sharing provision.");
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, 3) as RegistrationStep);
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0) as RegistrationStep);
  }

  function handleSubmit() {
    // Step 2 too — the last step is reachable by Back-then-Next.
    if (!validateStep(2) || !validateStep(3)) return;
    setError("");
    registerMutation.mutate({
      hackathonId: hackathon.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: normalizePhone(phone),
      age: parseInt(age),
      gender: gender || undefined,
      school: school.trim(),
      major: major.trim(),
      graduationYear: parseInt(graduationYear),
      levelOfStudy: levelOfStudy as LevelOfStudy,
      country: country.trim(),
      hackathonsAttended: hackathonsAttended
        ? parseInt(hackathonsAttended)
        : undefined,
      resumeUrl: resumeUrl.trim() || undefined,
      linkedinUrl: linkedinUrl.trim() || undefined,
      githubUrl: githubUrl.trim() || undefined,
      whyAttend: whyAttend.trim(),
      shirtSize: shirtSize || undefined,
      dietaryRestrictions: dietary.length ? dietary : undefined,
      emergencyContact: emergencyContact.trim() || undefined,
      emergencyPhone: normalizePhone(emergencyPhone) || undefined,
      needsHardware,
      agreeToCodeOfConduct: agreeToCoC,
      mlhCodeOfConduct,
      mlhDataSharing,
      mlhInformationalEmails,
      pronouns: pronouns.trim() || undefined,
      race: race.trim() || undefined,
      underrepresented,
      firstGeneration,
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {hackathon.description && (
        <LiquidGlass printed className="p-6">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            About
          </h3>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
            {hackathon.description}
          </p>
        </LiquidGlass>
      )}

      {hackathon.prizes && hackathon.prizes.length > 0 && (
        <LiquidGlass printed className="p-6">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Prizes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hackathon.prizes.map(
              (
                p: { place: string; amount: number; description?: string },
                i: number,
              ) => (
                <div
                  key={i}
                  className="p-5 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                >
                  <p className="text-base font-bold text-[var(--text-primary)] mb-1">
                    {p.place}
                  </p>
                  <p className="text-2xl font-black font-oswald text-accent mb-2">
                    ${p.amount.toLocaleString()}
                  </p>
                  {p.description && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {p.description}
                    </p>
                  )}
                </div>
              ),
            )}
          </div>
        </LiquidGlass>
      )}

      {hackathon.rules && (
        <LiquidGlass printed className="p-6">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Rules
          </h3>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
            {hackathon.rules}
          </p>
        </LiquidGlass>
      )}

      {(hackathon.registrationDeadline || hackathon.websiteUrl) && (
        <div className="flex flex-wrap gap-3">
          {hackathon.registrationDeadline && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]">
              <Clock className="w-3 h-3" />
              {deadlinePassed
                ? "Registration closed"
                : "Registration closes"}{" "}
              {formatDate(hackathon.registrationDeadline)}
            </span>
          )}
          {hackathon.websiteUrl && (
            <a
              href={hackathon.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)] hover:text-accent hover:border-accent/40 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Event website
            </a>
          )}
        </div>
      )}

      <LiquidGlass printed className="p-6">
        {success && (
          <div className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-sm">
            <p className="text-accent text-sm font-semibold">
              Registration received. An organiser will review it; your status
              updates here.
            </p>
          </div>
        )}

        {isRegistered || success ? (
          <div className="flex flex-col gap-2">
            <StatusBadge status={regStatus} />
            <p className="text-sm text-[var(--text-muted)]">
              {STATUS_LINE[regStatus] ?? ""}
            </p>
            {regStatus === "checked_in" && (
              <Link
                href={`/submit?id=${hackathon.id}`}
                className="mt-2 w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
              >
                Submit your project
              </Link>
            )}
            {/* On a team the server refuses until you leave it, so say that
                up front rather than after two clicks. */}
            {WITHDRAWABLE.has(regStatus) && myReg?.teamId ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                To withdraw, leave your team first.
              </p>
            ) : null}
            {WITHDRAWABLE.has(regStatus) &&
              !myReg?.teamId &&
              (confirmWithdraw ? (
                <div className="mt-2 flex flex-col gap-3">
                  <p className="text-sm text-[var(--text-muted)]">
                    Withdraw your registration? You can apply again while
                    registration is open.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        withdrawMutation.mutate({ hackathonId: hackathon.id })
                      }
                      disabled={withdrawMutation.isPending}
                      className="px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      {withdrawMutation.isPending ? "Withdrawing…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmWithdraw(false);
                        setWithdrawError("");
                      }}
                      disabled={withdrawMutation.isPending}
                      className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmWithdraw(true)}
                  className="mt-2 w-fit px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  Withdraw registration
                </button>
              ))}
            {withdrawError && (
              <p className="text-sm text-rose-400">{withdrawError}</p>
            )}
          </div>
        ) : canRegister && !deadlinePassed ? (
          // Once the form is open it renders below; this branch must not fall
          // through to "Registration is closed" above an open form.
          showForm ? null : (
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-2">
                Register
              </h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Four steps: personal info, school, experience, and logistics.
              </p>
              {isFull && (
                <p className="text-sm text-[var(--text-muted)] mb-6">
                  All seats are taken. You can still apply; new applicants are
                  waitlisted until a seat opens.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50 w-full sm:w-auto"
              >
                Start registration
              </button>
            </div>
          )
        ) : hackathon.status === "announced" ? (
          /* Announced is not closed — the closed message below reads as "you
             missed it". Join against THIS edition's id, not a bounce to
             /hacklytics which follows whichever event getUpcoming picks. */
          <InterestForm
            hackathonId={hackathon.id}
            callbackPath={`/hackathons/${hackathonSlug(hackathon.name)}`}
          />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Registration is closed.
          </p>
        )}

        {showForm && (
          <div className="mt-8 pt-8 border-t border-[var(--border-subtle)]">
            <StepProgress steps={REGISTRATION_STEPS} current={step} />

            {/* Step 1: Personal Info */}
            {step === 0 && (
              <StepContainer title="Personal Information">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormInput
                    label="First Name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                  />
                  <FormInput
                    label="Last Name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormInput
                    label="Phone Number"
                    required
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(formatPhoneAsTyped(e.target.value))
                    }
                    placeholder="(555) 123-4567"
                  />
                  <FormInput
                    label="Age"
                    required
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="21"
                    min={13}
                    max={120}
                  />
                </div>
                <FormChipSelect
                  label="Gender"
                  options={[...GENDERS]}
                  value={gender}
                  onChange={setGender}
                  allowDeselect
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
                  <FormInput
                    label="Pronouns"
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value)}
                    placeholder="They/Them"
                  />
                  <FormInput
                    label="Race / Ethnicity"
                    value={race}
                    onChange={(e) => setRace(e.target.value)}
                    placeholder="e.g. Asian, Hispanic, White, etc."
                  />
                </div>
                <div className="pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={underrepresented}
                      onChange={(e) => setUnderrepresented(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I consider myself part of an underrepresented group in
                      technology.
                    </span>
                  </label>
                </div>
              </StepContainer>
            )}

            {/* Step 2: Academic Info */}
            {step === 1 && (
              <StepContainer title="Academic Information">
                <SearchableSelect
                  label="School / University"
                  required
                  value={school}
                  onChange={setSchool}
                  options={schoolOptions}
                  placeholder="Start typing to search schools…"
                  hint="Not listed? Type it in — anything you enter is accepted."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <SearchableSelect
                    label="Major / Field of Study"
                    required
                    value={major}
                    onChange={setMajor}
                    options={MAJORS}
                    placeholder="Start typing to search majors…"
                    hint="Not listed? Type it in — anything you enter is accepted."
                  />
                  <FormInput
                    label="Graduation Year"
                    required
                    type="number"
                    value={graduationYear}
                    onChange={(e) => setGraduationYear(e.target.value)}
                    placeholder={String(CURRENT_YEAR)}
                    min={MIN_GRAD_YEAR}
                    max={MAX_GRAD_YEAR}
                  />
                </div>
                <FormChipSelect
                  label="Level of Study"
                  required
                  options={[...LEVELS_OF_STUDY]}
                  value={levelOfStudy}
                  onChange={setLevelOfStudy}
                />
                <FormInput
                  label="Country"
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="United States"
                />
                <div className="pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={firstGeneration}
                      onChange={(e) => setFirstGeneration(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I am a first-generation college student.
                    </span>
                  </label>
                </div>
              </StepContainer>
            )}

            {/* Step 3: Experience */}
            {step === 2 && (
              <StepContainer title="Experience & Links">
                <FormInput
                  label="How many hackathons have you attended?"
                  type="number"
                  value={hackathonsAttended}
                  onChange={(e) => setHackathonsAttended(e.target.value)}
                  placeholder="0"
                  min={0}
                  max={100}
                />
                <FormTextarea
                  label="Why do you want to attend?"
                  required
                  value={whyAttend}
                  onChange={(e) => setWhyAttend(e.target.value)}
                  placeholder="Tell us what excites you about this hackathon…"
                  maxLength={2000}
                  rows={4}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <FormInput
                    label="Resume URL"
                    type="url"
                    value={resumeUrl}
                    onChange={(e) => setResumeUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <FormInput
                    label="LinkedIn"
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                  <FormInput
                    label="GitHub"
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/…"
                  />
                </div>
              </StepContainer>
            )}

            {/* Step 4: Logistics */}
            {step === 3 && (
              <StepContainer title="Logistics & Consent">
                <FormChipSelect
                  label="T-Shirt Size"
                  options={[...SHIRT_SIZES]}
                  value={shirtSize}
                  onChange={(v) => setShirtSize(v as ShirtSize | "")}
                />
                <FormMultiChipSelect
                  label="Dietary Restrictions"
                  options={[...DIETARY_OPTIONS]}
                  selected={dietary}
                  onChange={setDietary}
                  noneOption="None"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormInput
                    label="Emergency Contact"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Full Name"
                  />
                  <FormInput
                    label="Emergency Phone"
                    type="tel"
                    autoComplete="tel"
                    value={emergencyPhone}
                    onChange={(e) =>
                      setEmergencyPhone(formatPhoneAsTyped(e.target.value))
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={needsHardware}
                      onChange={(e) => setNeedsHardware(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I require hardware provided by the hackathon to
                      participate (e.g., laptop).
                    </span>
                  </label>
                </div>
                <div className="pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={agreeToCoC}
                      onChange={(e) => setAgreeToCoC(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I agree to the{" "}
                      <span className="text-accent font-semibold">
                        Code of Conduct
                      </span>{" "}
                      and acknowledge that my information will be used for event
                      organization purposes. *
                    </span>
                  </label>
                </div>
                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={mlhCodeOfConduct}
                      onChange={(e) => setMlhCodeOfConduct(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I have read and agree to the{" "}
                      <span className="text-accent font-semibold">
                        MLH Code of Conduct
                      </span>
                      . *
                    </span>
                  </label>
                </div>
                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={mlhDataSharing}
                      onChange={(e) => setMlhDataSharing(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I authorize you to share my application/registration
                      information with Major League Hacking for event
                      administration, ranking, and MLH administration. *
                    </span>
                  </label>
                </div>
                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={mlhInformationalEmails}
                      onChange={(e) =>
                        setMlhInformationalEmails(e.target.checked)
                      }
                      className="mt-1 w-5 h-5 rounded-sm accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors leading-relaxed">
                      I authorize MLH to send me occasional emails about
                      relevant events, career opportunities, and community
                      announcements.
                    </span>
                  </label>
                </div>
              </StepContainer>
            )}

            <FormErrorAlert message={error} />
            <FormNavigation
              step={step}
              totalSteps={REGISTRATION_STEPS.length}
              onBack={handleBack}
              onNext={handleNext}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setError("");
                setStep(0);
              }}
              isSubmitting={registerMutation.isPending}
            />
          </div>
        )}
      </LiquidGlass>
    </div>
  );
}
