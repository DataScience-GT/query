"use client";

import type { LevelOfStudy, ShirtSize } from "@/components/hackathon/constants";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DIETARY_OPTIONS,
  GENDERS,
  LEVELS_OF_STUDY,
  MAJORS,
  REGISTRATION_STEPS,
  SCHOOLS,
  SHIRT_SIZES,
} from "@/components/hackathon/constants";
import {
  FormErrorAlert,
  FormNavigation,
  StepContainer,
} from "@/components/hackathon/FormComponents";
import { ResumeSection } from "@/components/portal/ResumeSection";
import { formatPhoneAsTyped, normalizePhone, phoneDigits } from "@/lib/phone";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

import type { RouterOutputs } from "@query/api";
import { MLH_CODE_OF_CONDUCT_URL } from "@query/core";
import { sectionTitle, textLink } from "@query/ui/classes";
import { FormChipSelect, FormMultiChipSelect } from "@query/ui/FormChipSelect";
import { FormInput } from "@query/ui/FormInput";
import { FormTextarea } from "@query/ui/FormTextarea";
import { SearchableSelect } from "@query/ui/SearchableSelect";
import { StepProgress } from "@query/ui/StepProgress";

type RegistrationStep = 0 | 1 | 2 | 3;

const MLH_PRIVACY_URL = "https://mlh.io/privacy";
const MLH_CONTEST_TERMS_URL =
  "https://github.com/MLH/mlh-policies/blob/main/contest-terms.md";

// The fields that show their own error under the input (the `error` prop in
// the form below). Every other field is only told about in the alert.
const INLINE_ERROR_FIELDS = new Set([
  "firstName",
  "lastName",
  "phone",
  "age",
  "graduationYear",
  "country",
  "whyAttend",
]);

// Native checkboxes; the accent colours the tick. The `!` beats the 44px
// minimum globals.css gives every checkbox on a touch screen, which would turn
// the box into a 44px block; the label row carries that target instead.
const checkboxClass =
  "mt-0.5 h-5 w-5 min-h-0! min-w-0! shrink-0 accent-[var(--accent)] cursor-pointer";
const checkboxRow = "flex min-h-11 items-start gap-3 cursor-pointer group";
const checkboxText =
  "text-[15px] leading-relaxed text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors";

// Relative to now so the range never goes stale: last year's grads up to an
// incoming first-year's eight-year horizon.
const CURRENT_YEAR = new Date().getFullYear();
const MIN_GRAD_YEAR = CURRENT_YEAR - 1;
const MAX_GRAD_YEAR = CURRENT_YEAR + 8;

/** A field that shows `seed` until the person edits it, so a seed that arrives
 *  late still lands and one they have typed over never comes back. `start` is
 *  an answer already in hand, which counts as typed. */
function useSeededField(seed: string, start: string | null) {
  const [edited, setEdited] = useState<string | null>(start);
  return [edited ?? seed, setEdited] as const;
}

/** A stored E.164 number as the form shows it. Only a US number loses its +1
 *  to be formatted; any other keeps its +, or it would be read back as a US
 *  number and saved with the wrong country code. */
function savedPhone(stored: string | null | undefined): string {
  return formatPhoneAsTyped((stored ?? "").replace(/^\+1(?=\d{10}$)/, ""));
}

/** The saved answers, or nothing: a draft that is missing, unreadable or not
 *  an object is the same as no draft. */
function readDraft(key: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

type Interest = NonNullable<RouterOutputs["hackathon"]["myInterest"]>;
/** The application as saved, which an edit starts from. */
export type SavedRegistration = NonNullable<
  RouterOutputs["hackathon"]["myParticipantRecord"]
>;

/** What the fields hold when an edit opens: the saved application, blanks
 *  included, so a seed never fills in what they left empty. */
function startFromRecord(record: SavedRegistration) {
  return {
    firstName: record.firstName ?? "",
    lastName: record.lastName ?? "",
    phone: savedPhone(record.phone),
    age: record.age != null ? String(record.age) : "",
    gender: record.gender ?? "",
    pronouns: record.pronouns ?? "",
    race: record.race ?? "",
    underrepresented: !!record.underrepresented,
    school: record.school ?? "",
    major: record.major ?? "",
    graduationYear:
      record.graduationYear != null ? String(record.graduationYear) : "",
    levelOfStudy: record.levelOfStudy ?? "",
    country: record.country ?? "",
    firstGeneration: !!record.firstGeneration,
    hackathonsAttended:
      record.hackathonsAttended != null
        ? String(record.hackathonsAttended)
        : "",
    resumeUrl: record.resumeUrl ?? "",
    linkedinUrl: record.linkedinUrl ?? "",
    githubUrl: record.githubUrl ?? "",
    whyAttend: record.whyAttend ?? "",
    shirtSize: (record.shirtSize ?? "") as ShirtSize | "",
    dietary: record.dietaryRestrictions ?? [],
    emergencyContact: record.emergencyContact ?? "",
    emergencyPhone: savedPhone(record.emergencyPhone),
    needsHardware: !!record.needsHardware,
    mlhInformationalEmails: !!record.mlhInformationalEmails,
  };
}

/** What the fields hold when a new registration opens. A saved answer beats a
 *  seed; a blank one leaves the seed showing, so a seeded field is null then. */
function startFromDraft(saved: Record<string, unknown>) {
  const text = (key: string) => {
    const value = saved[key];
    return typeof value === "string" ? value : "";
  };
  return {
    firstName: text("firstName") || null,
    lastName: text("lastName") || null,
    phone: text("phone"),
    age: text("age"),
    gender: "",
    pronouns: text("pronouns"),
    race: "",
    underrepresented: saved.underrepresented === true,
    school: text("school") || null,
    major: text("major"),
    graduationYear: text("graduationYear") || null,
    levelOfStudy: LEVELS_OF_STUDY.find((l) => l === saved.levelOfStudy) ?? "",
    country: text("country") || null,
    firstGeneration: saved.firstGeneration === true,
    hackathonsAttended: text("hackathonsAttended"),
    resumeUrl: text("resumeUrl"),
    linkedinUrl: text("linkedinUrl"),
    githubUrl: text("githubUrl"),
    whyAttend: text("whyAttend"),
    shirtSize: (SHIRT_SIZES.find((s) => s === saved.shirtSize) ?? "") as
      ShirtSize | "",
    dietary: Array.isArray(saved.dietary)
      ? saved.dietary.filter((d): d is string => typeof d === "string")
      : [],
    emergencyContact: "",
    emergencyPhone: "",
    needsHardware: saved.needsHardware === true,
    mlhInformationalEmails: false,
  };
}

/** The registration form, loaded only once someone opens it. Given `saved` it
 *  edits that application; without, it is a new registration that picks up the
 *  draft kept on this browser. */
export function RegistrationForm({
  hackathonId,
  interest,
  saved,
  onRegistered,
  onUpdated,
  onCancel,
}: {
  hackathonId: string;
  /** What they told the interest list, offered only where it fits this form. */
  interest?: Interest | null;
  saved?: SavedRegistration;
  onRegistered: () => void;
  onUpdated: () => void;
  onCancel: () => void;
}) {
  const editing = saved !== undefined;
  const [step, setStep] = useState<RegistrationStep>(0);
  const [error, setError] = useState("");
  // Field errors show only after a failed Continue, then follow the values.
  const [attempted, setAttempted] = useState(false);
  const formTop = useRef<HTMLDivElement>(null);

  const { data: session } = useSession();
  // Per account too, so someone else signing in on this browser never gets
  // these answers back.
  const draftKey = `reg-draft:${hackathonId}:${session?.user?.id ?? ""}`;

  // Read once, as the form opens.
  const [start] = useState(() =>
    saved ? startFromRecord(saved) : startFromDraft(readDraft(draftKey)),
  );

  // The account's name stands in until they type their own.
  const [accountFirst = "", ...accountRest] = (session?.user?.name ?? "")
    .trim()
    .split(/\s+/);

  // Step 1: Personal Info
  const [firstName, setFirstName] = useSeededField(
    accountFirst,
    start.firstName,
  );
  const [lastName, setLastName] = useSeededField(
    accountRest.join(" "),
    start.lastName,
  );
  const [phone, setPhone] = useState(start.phone);
  const [age, setAge] = useState(start.age);
  const [gender, setGender] = useState(start.gender);
  const [pronouns, setPronouns] = useState(start.pronouns);
  const [race, setRace] = useState(start.race);
  const [underrepresented, setUnderrepresented] = useState(
    start.underrepresented,
  );

  // Step 2: Academic
  // 12k schools / ~450KB, so it loads on the academic step rather than in the
  // bundle. A failed fetch leaves the short list, which still works.
  const [schoolOptions, setSchoolOptions] =
    useState<readonly string[]>(SCHOOLS);
  // What they told the interest list, offered only where it fits this form:
  // a school that is in the list, a graduation year that is in range.
  const interestSchool = interest?.school?.trim().toLowerCase();
  const seedSchool = useMemo(
    () =>
      interestSchool
        ? (schoolOptions.find((s) => s.toLowerCase() === interestSchool) ?? "")
        : "",
    [interestSchool, schoolOptions],
  );
  const interestYear = interest?.graduationYear;
  const seedYear =
    interestYear &&
    interestYear >= MIN_GRAD_YEAR &&
    interestYear <= MAX_GRAD_YEAR
      ? String(interestYear)
      : "";
  const [school, setSchool] = useSeededField(seedSchool, start.school);
  const [major, setMajor] = useState(start.major);
  const [graduationYear, setGraduationYear] = useSeededField(
    seedYear,
    start.graduationYear,
  );
  const [levelOfStudy, setLevelOfStudy] = useState(start.levelOfStudy);
  const [country, setCountry] = useSeededField(
    interest?.country?.trim() || "United States",
    start.country,
  );
  const [firstGeneration, setFirstGeneration] = useState(start.firstGeneration);

  // Step 3: Experience
  const [hackathonsAttended, setHackathonsAttended] = useState(
    start.hackathonsAttended,
  );
  const [resumeUrl, setResumeUrl] = useState(start.resumeUrl);
  const [linkedinUrl, setLinkedinUrl] = useState(start.linkedinUrl);
  const [githubUrl, setGithubUrl] = useState(start.githubUrl);
  const [whyAttend, setWhyAttend] = useState(start.whyAttend);

  // Step 4: Logistics
  const [shirtSize, setShirtSize] = useState<ShirtSize | "">(start.shirtSize);
  const [dietary, setDietary] = useState<string[]>(start.dietary);
  const [emergencyContact, setEmergencyContact] = useState(
    start.emergencyContact,
  );
  const [emergencyPhone, setEmergencyPhone] = useState(start.emergencyPhone);
  const [needsHardware, setNeedsHardware] = useState(start.needsHardware);
  const [agreeToCoC, setAgreeToCoC] = useState(false);
  const [mlhCodeOfConduct, setMlhCodeOfConduct] = useState(false);
  const [mlhDataSharing, setMlhDataSharing] = useState(false);
  const [mlhInformationalEmails, setMlhInformationalEmails] = useState(
    start.mlhInformationalEmails,
  );

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

  // Switching tabs unmounts this one, so the answers are kept as they change.
  // The consents are left out on purpose: they are ticked fresh at submit.
  // So are gender, race and the emergency contact: this portal is used on
  // shared and borrowed laptops, and sensitive personal details should not
  // sit in localStorage in clear text.
  const draft = JSON.stringify({
    firstName,
    lastName,
    phone,
    age,
    pronouns,
    underrepresented,
    school,
    major,
    graduationYear,
    levelOfStudy,
    country,
    firstGeneration,
    hackathonsAttended,
    resumeUrl,
    linkedinUrl,
    githubUrl,
    whyAttend,
    shirtSize,
    dietary,
    needsHardware,
  });
  useEffect(() => {
    // An edit starts from the saved application, so it must not overwrite the
    // draft kept for a first submission.
    if (editing) return;
    try {
      localStorage.setItem(draftKey, draft);
    } catch {
      // Storage full or blocked: the form still works, it just is not kept.
    }
  }, [editing, draftKey, draft]);

  // The form stands in for the overview, but the header and tabs are still
  // above it, so bring it into view on open and the new step's heading on
  // every step change.
  useEffect(() => {
    formTop.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const utils = trpc.useUtils();
  const registerMutation = trpc.hackathon.register.useMutation({
    onSuccess: () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear if storage is blocked.
      }
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.list.invalidate();
      utils.hackathon.getById.invalidate({ id: hackathonId });
      onRegistered();
    },
    onError: (e) => setError(e.message),
  });

  const updateMutation = trpc.hackathon.updateMyRegistration.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({ hackathonId });
      onUpdated();
    },
    onError: (e) => setError(e.message),
  });

  // Every field that fails on a step, in form order, as [field, message].
  function stepProblems(s: RegistrationStep): [string, string][] {
    const problems: [string, string][] = [];
    const need = (field: string, failed: boolean, message: string) => {
      if (failed) problems.push([field, message]);
    };
    if (s === 0) {
      need("firstName", !firstName.trim(), "First name is required.");
      need("lastName", !lastName.trim(), "Last name is required.");
      need(
        "phone",
        phoneDigits(phone).length < 10,
        phone.trim()
          ? "Please enter a complete phone number."
          : "Phone number is required.",
      );
      need(
        "age",
        !age || parseInt(age) < 13 || parseInt(age) > 120,
        "Please enter a valid age (13-120).",
      );
    } else if (s === 1) {
      need("school", !school.trim(), "School / university is required.");
      need("major", !major.trim(), "Major / field of study is required.");
      need(
        "graduationYear",
        !graduationYear ||
          parseInt(graduationYear) < MIN_GRAD_YEAR ||
          parseInt(graduationYear) > MAX_GRAD_YEAR,
        "Please enter a valid graduation year.",
      );
      need("levelOfStudy", !levelOfStudy, "Level of study is required.");
      need("country", !country.trim(), "Country is required.");
    } else if (s === 2) {
      need(
        "whyAttend",
        !whyAttend.trim(),
        "Please tell us why you want to attend.",
      );
    } else if (s === 3 && !editing) {
      // Already agreed to when the application was sent, so not asked again.
      need("agreeToCoC", !agreeToCoC, "You must agree to the Code of Conduct.");
      need(
        "mlhCodeOfConduct",
        !mlhCodeOfConduct,
        "You must agree to the MLH Code of Conduct.",
      );
      need(
        "mlhDataSharing",
        !mlhDataSharing,
        "You must agree to the MLH Data Sharing provision.",
      );
    }
    return problems;
  }
  const fieldErrors: Record<string, string> = attempted
    ? Object.fromEntries(stepProblems(step))
    : {};

  function validateStep(s: RegistrationStep): boolean {
    const problems = stepProblems(s);
    // A field that prints its own message is not repeated in the alert, which
    // then only points at it. A step other than the one on screen has no
    // field to point at, so its messages stay in the alert.
    const unmarked = problems
      .filter(([field]) => s !== step || !INLINE_ERROR_FIELDS.has(field))
      .map(([, message]) => message);
    setError(
      unmarked.length
        ? unmarked.join(" ")
        : problems.length === 1
          ? "Fix the field marked above."
          : problems.length
            ? "Fix the fields marked above."
            : "",
    );
    setAttempted(problems.length > 0);
    return problems.length === 0;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, 3) as RegistrationStep);
  }

  function handleBack() {
    setError("");
    setAttempted(false);
    setStep((s) => Math.max(s - 1, 0) as RegistrationStep);
  }

  function handleSubmit() {
    // Step 2 too — the last step is reachable by Back-then-Next.
    if (!validateStep(2) || !validateStep(3)) return;
    setError("");
    const answers = {
      hackathonId,
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
      mlhInformationalEmails,
      pronouns: pronouns.trim() || undefined,
      race: race.trim() || undefined,
      underrepresented,
      firstGeneration,
    };
    if (editing) {
      updateMutation.mutate(answers);
      return;
    }
    registerMutation.mutate({
      ...answers,
      agreeToCodeOfConduct: agreeToCoC,
      mlhCodeOfConduct,
      mlhDataSharing,
    });
  }

  return (
    <section>
      {/* Clears the fixed 64px top bar on mobile. */}
      <div ref={formTop} className="scroll-mt-24 md:scroll-mt-6">
        <h2 className={`mb-6 ${sectionTitle}`}>
          {editing ? "Edit application" : "Register"}
        </h2>
        <StepProgress steps={REGISTRATION_STEPS} current={step} />

        {/* Step 1: Personal Info */}
        {step === 0 && (
          <StepContainer title="Personal information">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormInput
                label="First name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                error={fieldErrors.firstName}
                placeholder="John"
              />
              <FormInput
                label="Last name"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                error={fieldErrors.lastName}
                placeholder="Doe"
              />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormInput
                label="Phone number"
                required
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneAsTyped(e.target.value))}
                error={fieldErrors.phone}
                placeholder="(555) 123-4567"
              />
              <FormInput
                label="Age"
                required
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                error={fieldErrors.age}
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
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              <label className={checkboxRow}>
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
              hint="Not listed? Type it in. Anything you enter is accepted."
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SearchableSelect
                label="Major / field of study"
                required
                value={major}
                onChange={setMajor}
                options={MAJORS}
                placeholder="Start typing to search majors…"
              />
              <FormInput
                label="Graduation year"
                required
                type="number"
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                error={fieldErrors.graduationYear}
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
              error={fieldErrors.country}
              placeholder="United States"
            />
            <div className="pt-4">
              <label className={checkboxRow}>
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
              error={fieldErrors.whyAttend}
              placeholder="Tell us what excites you about this hackathon…"
              maxLength={2000}
              rows={4}
            />
            <ResumeSection />
            <FormInput
              label="Or paste a link to your resume"
              type="url"
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
              placeholder="https://…"
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              <label className={checkboxRow}>
                <input
                  type="checkbox"
                  checked={needsHardware}
                  onChange={(e) => setNeedsHardware(e.target.checked)}
                  className={checkboxClass}
                />
                <span className={checkboxText}>
                  I require hardware provided by the hackathon to participate
                  (e.g., laptop).
                </span>
              </label>
            </div>
            {/* Agreed to when the application was sent; not asked again. */}
            {!editing && (
              <>
                <div className="pt-4">
                  <label className={checkboxRow}>
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
                  <label className={checkboxRow}>
                    <input
                      type="checkbox"
                      checked={mlhCodeOfConduct}
                      onChange={(e) => setMlhCodeOfConduct(e.target.checked)}
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
                      I have read and agree to the{" "}
                      <a
                        href={MLH_CODE_OF_CONDUCT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={textLink}
                      >
                        MLH Code of Conduct
                      </a>
                      . *
                    </span>
                  </label>
                </div>
                <div className="pt-2">
                  <label className={checkboxRow}>
                    <input
                      type="checkbox"
                      checked={mlhDataSharing}
                      onChange={(e) => setMlhDataSharing(e.target.checked)}
                      className={checkboxClass}
                    />
                    <span className={checkboxText}>
                      I authorize you to share my application/registration
                      information with Major League Hacking for event
                      administration, ranking, and MLH administration in-line
                      with the{" "}
                      <a
                        href={MLH_PRIVACY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={textLink}
                      >
                        MLH Privacy Policy
                      </a>
                      . I further agree to the terms of both the{" "}
                      <a
                        href={MLH_CONTEST_TERMS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={textLink}
                      >
                        MLH Contest Terms and Conditions
                      </a>{" "}
                      and the{" "}
                      <a
                        href={MLH_PRIVACY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={textLink}
                      >
                        MLH Privacy Policy
                      </a>
                      . *
                    </span>
                  </label>
                </div>
              </>
            )}
            <div className="pt-2">
              <label className={checkboxRow}>
                <input
                  type="checkbox"
                  checked={mlhInformationalEmails}
                  onChange={(e) => setMlhInformationalEmails(e.target.checked)}
                  className={checkboxClass}
                />
                <span className={checkboxText}>
                  I authorize MLH to send me occasional emails about relevant
                  events, career opportunities, and community announcements.
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
          onCancel={onCancel}
          isSubmitting={registerMutation.isPending || updateMutation.isPending}
          submitLabel={editing ? "Save changes" : undefined}
        />
      </div>
    </section>
  );
}
