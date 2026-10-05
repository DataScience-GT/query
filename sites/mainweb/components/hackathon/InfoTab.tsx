"use client";

import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatPhoneAsTyped, normalizePhone, phoneDigits } from "@/lib/phone";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";
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
// Native checkboxes; the accent colours the tick.
const checkboxClass =
  "mt-1 h-4 w-4 shrink-0 accent-[var(--accent)] cursor-pointer";
const checkboxText =
  "text-[15px] leading-relaxed text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors";

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
    <div className="space-y-10">
      {hackathon.description && (
        <section>
          <h3 className={itemTitle}>About</h3>
          <p className={`mt-2 max-w-2xl whitespace-pre-wrap ${body}`}>
            {hackathon.description}
          </p>
        </section>
      )}

      {hackathon.prizes && hackathon.prizes.length > 0 && (
        <section className="border-t border-[var(--border-subtle)] pt-6">
          <h3 className={itemTitle}>Prizes</h3>
          <dl className="mt-3 max-w-2xl">
            {hackathon.prizes.map(
              (
                p: { place: string; amount: number; description?: string },
                i: number,
              ) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-6 border-b border-[var(--border-subtle)] py-3"
                >
                  <dt className="min-w-0">
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                      {p.place}
                    </span>
                    {p.description && (
                      <span className={`block ${meta}`}>{p.description}</span>
                    )}
                  </dt>
                  <dd className="shrink-0 font-[family-name:var(--font-display)] text-[22px] font-semibold tabular-nums text-[var(--text-primary)]">
                    ${p.amount.toLocaleString()}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>
      )}

      {hackathon.rules && (
        <section className="border-t border-[var(--border-subtle)] pt-6">
          <h3 className={itemTitle}>Rules</h3>
          <p className={`mt-2 max-w-2xl whitespace-pre-wrap ${body}`}>
            {hackathon.rules}
          </p>
        </section>
      )}

      {(hackathon.registrationDeadline || hackathon.websiteUrl) && (
        <dl className="grid max-w-2xl grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 border-t border-[var(--border-subtle)] pt-6">
          {hackathon.registrationDeadline && (
            <div>
              <dt className={label}>
                {deadlinePassed ? "Registration closed" : "Registration closes"}
              </dt>
              <dd className="mt-0.5 text-[15px] text-[var(--text-primary)]">
                {formatDate(hackathon.registrationDeadline)}
              </dd>
            </div>
          )}
          {hackathon.websiteUrl && (
            <div>
              <dt className={label}>Website</dt>
              <dd className="mt-0.5">
                <a
                  href={hackathon.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={textLink}
                >
                  Event website
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}

      <section className="border-t border-[var(--border-subtle)] pt-8">
        {success && (
          <p className="mb-6 border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
            Registration received. An organiser will review it; your status
            updates here.
          </p>
        )}

        {isRegistered || success ? (
          <div className="flex flex-col items-start gap-2">
            <StatusBadge status={regStatus} />
            <p className={body}>{STATUS_LINE[regStatus] ?? ""}</p>
            {regStatus === "checked_in" && (
              <Link
                href={`/submit?id=${hackathon.id}`}
                className={`mt-3 ${btnPrimary}`}
              >
                Submit your project
              </Link>
            )}
            {/* On a team the server refuses until you leave it, so say that
                up front rather than after two clicks. */}
            {WITHDRAWABLE.has(regStatus) && myReg?.teamId ? (
              <p className={`mt-6 ${meta}`}>
                To withdraw, leave your team first.
              </p>
            ) : null}
            {WITHDRAWABLE.has(regStatus) &&
              !myReg?.teamId &&
              (confirmWithdraw ? (
                <div className="mt-6 flex w-full flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
                  <p className={body}>
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
                      className={btnDanger}
                    >
                      {withdrawMutation.isPending ? "Withdrawing…" : "Withdraw"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmWithdraw(false);
                        setWithdrawError("");
                      }}
                      disabled={withdrawMutation.isPending}
                      className={btnSecondary}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 w-full border-t border-[var(--border-subtle)] pt-4">
                  <button
                    type="button"
                    onClick={() => setConfirmWithdraw(true)}
                    className={btnDanger}
                  >
                    Withdraw registration
                  </button>
                </div>
              ))}
            {withdrawError && (
              <p role="alert" className="text-[15px] text-[var(--danger)]">
                {withdrawError}
              </p>
            )}
          </div>
        ) : canRegister && !deadlinePassed ? (
          // Once the form is open it renders below; this branch must not fall
          // through to "Registration is closed" above an open form.
          showForm ? null : (
            <div>
              <h2 className={sectionTitle}>Register</h2>
              <p className={`mt-2 ${body}`}>
                Four steps: personal info, school, experience, and logistics.
              </p>
              {isFull && (
                <p className={`mt-2 ${body}`}>
                  All seats are taken. You can still apply; new applicants are
                  waitlisted until a seat opens.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className={`mt-6 w-full sm:w-auto ${btnPrimary}`}
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
          <p className={body}>Registration is closed.</p>
        )}

        {showForm && (
          <div>
            <h2 className={`mb-6 ${sectionTitle}`}>Register</h2>
            <StepProgress steps={REGISTRATION_STEPS} current={step} />

            {/* Step 1: Personal Info */}
            {step === 0 && (
              <StepContainer title="Personal information">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormInput
                    label="First name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                  />
                  <FormInput
                    label="Last name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormInput
                    label="Phone number"
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
                    placeholder="they/them"
                  />
                  <FormInput
                    label="Race / ethnicity"
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
                      I consider myself part of an underrepresented group in
                      technology.
                    </span>
                  </label>
                </div>
              </StepContainer>
            )}

            {/* Step 2: Academic Info */}
            {step === 1 && (
              <StepContainer title="Academic information">
                <SearchableSelect
                  label="School / university"
                  required
                  value={school}
                  onChange={setSchool}
                  options={schoolOptions}
                  placeholder="Start typing to search schools…"
                  hint="Not listed? Type it in — anything you enter is accepted."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <SearchableSelect
                    label="Major / field of study"
                    required
                    value={major}
                    onChange={setMajor}
                    options={MAJORS}
                    placeholder="Start typing to search majors…"
                    hint="Not listed? Type it in — anything you enter is accepted."
                  />
                  <FormInput
                    label="Graduation year"
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
                  label="Level of study"
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
                      I am a first-generation college student.
                    </span>
                  </label>
                </div>
              </StepContainer>
            )}

            {/* Step 3: Experience */}
            {step === 2 && (
              <StepContainer title="Experience and links">
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
              <StepContainer title="Logistics and consent">
                <FormChipSelect
                  label="T-shirt size"
                  options={[...SHIRT_SIZES]}
                  value={shirtSize}
                  onChange={(v) => setShirtSize(v as ShirtSize | "")}
                />
                <FormMultiChipSelect
                  label="Dietary restrictions"
                  options={[...DIETARY_OPTIONS]}
                  selected={dietary}
                  onChange={setDietary}
                  noneOption="None"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormInput
                    label="Emergency contact"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Full name"
                  />
                  <FormInput
                    label="Emergency phone"
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
                      I agree to the{" "}
                      <span className="font-semibold text-[var(--text-primary)]">
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
                      I have read and agree to the{" "}
                      <span className="font-semibold text-[var(--text-primary)]">
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
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
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
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
      </section>
    </div>
  );
}
