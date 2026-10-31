"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
  status,
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
import { ResumeSection } from "@/components/portal/ResumeSection";
import { hackathonSlug } from "@/lib/hackathon-slug";
import Link from "next/link";

type RegistrationStep = 0 | 1 | 2 | 3;

const MLH_CODE_OF_CONDUCT_URL =
  "https://static.mlh.io/docs/mlh-code-of-conduct.pdf";
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

// Statuses that can still back out. checked_in is on site and rejected has
// nothing to withdraw; the server refuses both anyway.
const WITHDRAWABLE = new Set(["pending", "approved", "waitlisted"]);

// Relative to now so the range never goes stale: last year's grads up to an
// incoming first-year's eight-year horizon.
// Native checkboxes; the accent colours the tick. The `!` beats the 44px
// minimum globals.css gives every checkbox on a touch screen, which would turn
// the box into a 44px block; the label row carries that target instead.
const checkboxClass =
  "mt-0.5 h-5 w-5 min-h-0! min-w-0! shrink-0 accent-[var(--accent)] cursor-pointer";
const checkboxRow = "flex min-h-11 items-start gap-3 cursor-pointer group";
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

/** A field that shows `seed` until the person edits it, so a seed that arrives
 *  late still lands and one they have typed over never comes back. */
function useSeededField(seed: string) {
  const [edited, setEdited] = useState<string | null>(null);
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
  myReg?: {
    registrationStatus: string;
    teamId?: string | null;
    attendanceConfirmedAt?: string | Date | null;
  } | null;
}) {
  const [showForm, setShowForm] = useState(false);
  // The form is open on an existing, pending application rather than a new one.
  const [editing, setEditing] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [updated, setUpdated] = useState(false);
  const [step, setStep] = useState<RegistrationStep>(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  // Field errors show only after a failed Continue, then follow the values.
  const [attempted, setAttempted] = useState(false);
  const formTop = useRef<HTMLDivElement>(null);

  const { data: session } = useSession();
  // Per account too, so someone else signing in on this browser never gets
  // these answers back.
  const draftKey = `reg-draft:${hackathon.id}:${session?.user?.id ?? ""}`;

  // The account's name stands in until they type their own.
  const [accountFirst = "", ...accountRest] = (session?.user?.name ?? "")
    .trim()
    .split(/\s+/);

  // Step 1: Personal Info
  const [firstName, setFirstName] = useSeededField(accountFirst);
  const [lastName, setLastName] = useSeededField(accountRest.join(" "));
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
  // What they told the interest list, offered only where it fits this form:
  // a school that is in the list, a graduation year that is in range.
  const interest = trpc.hackathon.myInterest.useQuery(
    { hackathonId: hackathon.id },
    { enabled: hackathon.status === "open" && !isRegistered },
  );
  const interestSchool = interest.data?.school?.trim().toLowerCase();
  const seedSchool = useMemo(
    () =>
      interestSchool
        ? (schoolOptions.find((s) => s.toLowerCase() === interestSchool) ?? "")
        : "",
    [interestSchool, schoolOptions],
  );
  const interestYear = interest.data?.graduationYear;
  const seedYear =
    interestYear &&
    interestYear >= MIN_GRAD_YEAR &&
    interestYear <= MAX_GRAD_YEAR
      ? String(interestYear)
      : "";
  const [school, setSchool] = useSeededField(seedSchool);
  const [major, setMajor] = useState("");
  const [graduationYear, setGraduationYear] = useSeededField(seedYear);
  const [levelOfStudy, setLevelOfStudy] = useState("");
  const [country, setCountry] = useSeededField(
    interest.data?.country?.trim() || "United States",
  );
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
    if (!showForm || editing) return;
    try {
      localStorage.setItem(draftKey, draft);
    } catch {
      // Storage full or blocked: the form still works, it just is not kept.
    }
  }, [showForm, editing, draftKey, draft]);

  // Read once, as the form opens. A saved answer beats a seed; a blank one
  // leaves the seed showing.
  function openForm() {
    const saved = readDraft(draftKey);
    const text: Record<string, (v: string) => void> = {
      firstName: setFirstName,
      lastName: setLastName,
      phone: setPhone,
      age: setAge,
      pronouns: setPronouns,
      school: setSchool,
      major: setMajor,
      graduationYear: setGraduationYear,
      country: setCountry,
      hackathonsAttended: setHackathonsAttended,
      resumeUrl: setResumeUrl,
      linkedinUrl: setLinkedinUrl,
      githubUrl: setGithubUrl,
      whyAttend: setWhyAttend,
    };
    for (const [key, set] of Object.entries(text)) {
      const value = saved[key];
      if (typeof value === "string" && value) set(value);
    }
    const level = LEVELS_OF_STUDY.find((l) => l === saved.levelOfStudy);
    if (level) setLevelOfStudy(level);
    const size = SHIRT_SIZES.find((s) => s === saved.shirtSize);
    if (size) setShirtSize(size);
    if (Array.isArray(saved.dietary)) {
      setDietary(saved.dietary.filter((d): d is string => typeof d === "string"));
    }
    if (saved.underrepresented === true) setUnderrepresented(true);
    if (saved.firstGeneration === true) setFirstGeneration(true);
    if (saved.needsHardware === true) setNeedsHardware(true);
    setShowForm(true);
  }

  // The form stands in for the overview, but the header and tabs are still
  // above it, so bring it into view on open and the new step's heading on
  // every step change.
  useEffect(() => {
    if (showForm) formTop.current?.scrollIntoView({ block: "start" });
  }, [showForm, step]);

  const utils = trpc.useUtils();
  const registerMutation = trpc.hackathon.register.useMutation({
    onSuccess: () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear if storage is blocked.
      }
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
      setUpdated(false);
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({
        hackathonId: hackathon.id,
      });
      utils.hackathon.list.invalidate();
      utils.hackathon.getById.invalidate({ id: hackathon.id });
    },
    onError: (e) => setWithdrawError(e.message),
  });

  const updateMutation = trpc.hackathon.updateMyRegistration.useMutation({
    onSuccess: () => {
      setUpdated(true);
      setEditing(false);
      setShowForm(false);
      setStep(0);
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({
        hackathonId: hackathon.id,
      });
    },
    onError: (e) => setError(e.message),
  });

  const confirmMutation = trpc.hackathon.confirmAttendance.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.hackathon.myParticipantRecord.invalidate({
        hackathonId: hackathon.id,
      });
    },
  });

  // Opens the form on what was submitted. Read fresh rather than from cache:
  // the answers being edited must be the saved ones, not an older copy.
  async function openEdit() {
    setEditError("");
    setLoadingEdit(true);
    try {
      const record = await utils.hackathon.myParticipantRecord.fetch(
        { hackathonId: hackathon.id },
        { staleTime: 0 },
      );
      if (!record) {
        setEditError("Couldn't find your application. Refresh the page.");
        return;
      }
      setFirstName(record.firstName ?? "");
      setLastName(record.lastName ?? "");
      setPhone(savedPhone(record.phone));
      setAge(record.age != null ? String(record.age) : "");
      setGender(record.gender ?? "");
      setPronouns(record.pronouns ?? "");
      setRace(record.race ?? "");
      setUnderrepresented(!!record.underrepresented);
      setSchool(record.school ?? "");
      setMajor(record.major ?? "");
      setGraduationYear(
        record.graduationYear != null ? String(record.graduationYear) : "",
      );
      setLevelOfStudy(record.levelOfStudy ?? "");
      setCountry(record.country ?? "");
      setFirstGeneration(!!record.firstGeneration);
      setHackathonsAttended(
        record.hackathonsAttended != null
          ? String(record.hackathonsAttended)
          : "",
      );
      setResumeUrl(record.resumeUrl ?? "");
      setLinkedinUrl(record.linkedinUrl ?? "");
      setGithubUrl(record.githubUrl ?? "");
      setWhyAttend(record.whyAttend ?? "");
      setShirtSize(record.shirtSize ?? "");
      setDietary(record.dietaryRestrictions ?? []);
      setEmergencyContact(record.emergencyContact ?? "");
      setEmergencyPhone(savedPhone(record.emergencyPhone));
      setNeedsHardware(!!record.needsHardware);
      setMlhInformationalEmails(!!record.mlhInformationalEmails);
      setUpdated(false);
      setError("");
      setAttempted(false);
      setStep(0);
      setEditing(true);
      setShowForm(true);
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : "Couldn't load your application.",
      );
    } finally {
      setLoadingEdit(false);
    }
  }

  const isFull = !!(
    hackathon.maxParticipants &&
    hackathon.currentParticipants >= hackathon.maxParticipants
  );
  const deadlinePassed = !!(
    hackathon.registrationDeadline &&
    // oxlint-disable-next-line react/purity
    new Date(hackathon.registrationDeadline) < new Date()
  );
  // Full no longer blocks applying: capacity counts accepted people only, and
  // organisers waitlist anyone past it.
  const canRegister =
    hackathon.status === "open" && !isRegistered && !deadlinePassed;
  // A fresh registration starts pending; myReg lags a refetch behind success.
  const regStatus = myReg?.registrationStatus ?? "pending";
  // The server refuses an edit once an organiser has decided or registration
  // has closed; offering it only while it can work saves a dead end.
  const canEdit =
    isRegistered &&
    regStatus === "pending" &&
    hackathon.status === "open" &&
    !deadlinePassed;
  // confirmMutation covers the refetch that follows the click.
  const attendanceConfirmed =
    !!myReg?.attendanceConfirmedAt || confirmMutation.isSuccess;
  const registered = isRegistered || success;
  // The header badge and the next-step strip already say where an application
  // stands, so this column holds only what can be done about it. Decided or
  // waiting with nothing to do, it is not drawn.
  const hasStatusActions =
    regStatus === "approved" || regStatus === "checked_in" || canEdit;
  const showsStatus = success || updated || !registered || hasStatusActions;
  // The register line carries the deadline, so the facts list skips it then.
  const registerOffered = !registered && canRegister;

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
    <div className="space-y-10">
      {!showForm && showsStatus && (
        <section>
          {success && (
            <p className="mb-6 border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
              Registration received. An organiser will review it; your status
              updates here.
            </p>
          )}

          {updated && (
            <p className="mb-6 border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
              Application updated.
            </p>
          )}

          {registered && hasStatusActions ? (
            <div className="flex flex-col items-start gap-2">
              {regStatus === "approved" &&
                (attendanceConfirmed ? (
                  <p className="flex flex-wrap items-center gap-x-3">
                    <span className={status("success")}>Confirmed</span>
                    <span className={meta}>
                      Organisers know you&apos;re coming.
                    </span>
                  </p>
                ) : (
                  <div className="flex flex-col items-start gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        confirmMutation.mutate({ hackathonId: hackathon.id })
                      }
                      disabled={confirmMutation.isPending}
                      className={btnPrimary}
                    >
                      {confirmMutation.isPending ? "Confirming…" : "I'm coming"}
                    </button>
                    <p className={meta}>Let organisers know you&apos;ll be there.</p>
                    {confirmMutation.isError && (
                      <p role="alert" className="text-[15px] text-[var(--danger)]">
                        {confirmMutation.error.message}
                      </p>
                    )}
                  </div>
                ))}
              {canEdit && (
                <div className="flex flex-col items-start gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    disabled={loadingEdit}
                    className={btnSecondary}
                  >
                    {loadingEdit ? "Loading…" : "Edit application"}
                  </button>
                  <p className={meta}>
                    Fix a typo or add a link until an organiser reviews it.
                  </p>
                  {editError && (
                    <p role="alert" className="text-[15px] text-[var(--danger)]">
                      {editError}
                    </p>
                  )}
                </div>
              )}
              {regStatus === "checked_in" && (
                <Link
                  href={`/submit?id=${hackathon.id}`}
                  className={btnPrimary}
                >
                  Submit your project
                </Link>
              )}
            </div>
          ) : registered ? null : canRegister && !deadlinePassed ? (
            <div>
              <h2 className={sectionTitle}>Register</h2>
              <p className={`mt-2 ${body}`}>
                Four steps: personal info, school, experience, and logistics.
                {hackathon.registrationDeadline
                  ? ` Closes ${formatDate(hackathon.registrationDeadline)}.`
                  : ""}
              </p>
              {isFull && (
                <p className={`mt-2 ${body}`}>
                  All seats are taken. You can still apply; new applicants are
                  waitlisted until a seat opens.
                </p>
              )}
              <button
                type="button"
                onClick={openForm}
                className={`mt-6 w-full sm:w-auto ${btnPrimary}`}
              >
                Start registration
              </button>
            </div>
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
        </section>
      )}

      {/* With the form open it is the only thing in the panel. */}
      {!showForm && (
        <>
          {hackathon.description && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <h3 className={itemTitle}>About</h3>
              <p className={`mt-2 max-w-2xl whitespace-pre-wrap ${body}`}>
                {hackathon.description}
              </p>
            </section>
          )}

          {hackathon.prizes && hackathon.prizes.length > 0 && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
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
                          <span className={`block ${meta}`}>
                            {p.description}
                          </span>
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
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <h3 className={itemTitle}>Rules</h3>
              <ul className="mt-2 max-w-2xl space-y-3">
                {hackathon.rules
                  .split("\n")
                  .map((rule) => rule.trim())
                  .filter(Boolean)
                  .map((rule, i) => (
                    <li key={i} className={body}>
                      {rule}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {((hackathon.registrationDeadline && !registerOffered) ||
            hackathon.websiteUrl) && (
            <dl className="grid max-w-2xl grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              {hackathon.registrationDeadline && !registerOffered && (
                <div>
                  <dt className={label}>
                    {deadlinePassed
                      ? "Registration closed"
                      : "Registration closes"}
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

          {/* Last, away from the status and the confirm button. */}
          {registered && WITHDRAWABLE.has(regStatus) && (
            <section className="border-t border-[var(--border-subtle)] pt-6 first:border-t-0 first:pt-0">
              <div className="flex flex-col items-start gap-3">
                {regStatus === "approved" && !confirmWithdraw && (
                  <p className={body}>
                    Can&apos;t make it? Withdraw so a waitlisted hacker can
                    have your seat.
                  </p>
                )}
                {/* On a team the server refuses until you leave it, so say
                    that up front rather than after two clicks. */}
                {myReg?.teamId ? (
                  <p className={meta}>To withdraw, leave your team first.</p>
                ) : confirmWithdraw ? (
                  <div className="flex w-full flex-col gap-3">
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
                  <button
                    type="button"
                    onClick={() => setConfirmWithdraw(true)}
                    className={btnDanger}
                  >
                    Withdraw registration
                  </button>
                )}
                {withdrawError && (
                  <p role="alert" className="text-[15px] text-[var(--danger)]">
                    {withdrawError}
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {showForm && (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                  <label className={checkboxRow}>
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
                setEditing(false);
                setError("");
                setAttempted(false);
                setStep(0);
              }}
              isSubmitting={registerMutation.isPending || updateMutation.isPending}
              submitLabel={editing ? "Save changes" : undefined}
            />
          </div>
        </section>
      )}
    </div>
  );
}
