import { z } from "zod";

// What a saved application draft may hold. These are the form's own answers
// as typed, so numbers and yes/no answers are strings, and every one is
// optional: a draft is whatever the person got to.
//
// Exactly the fields the form keeps in its browser draft, and no more. Left out
// on purpose, so a payload that carries them has them dropped rather than
// stored: citizenship and fasting, which the form never keeps; the three
// consents, which are ticked fresh at submit; and the resume file, which has
// its own upload. The same goes for phone, age, gender, race and the emergency
// contact, which the form keeps off shared laptops. zod drops every key not
// listed here, so a new field has to be added in both places on purpose.
const text = (max: number) => z.string().max(max).optional();
const essay = text(2000);

export const applicationDraftData = z.object({
  firstName: text(100),
  lastName: text(100),
  pronouns: text(50),
  underrepresented: z.boolean().optional(),
  school: text(300),
  major: text(300),
  graduationYear: text(10),
  levelOfStudy: text(100),
  country: text(100),
  firstGeneration: z.boolean().optional(),
  hackathonsAttended: text(10),
  resumeUrl: text(500),
  linkedinUrl: text(500),
  githubUrl: text(500),
  whyAttend: essay,
  isGtStudent: text(20),
  isDsgtMember: text(20),
  attendedHacklyticsBefore: text(20),
  travelReimbursement: text(20),
  travelFromCity: text(100),
  travelFromState: text(100),
  travelFromCountry: text(100),
  travelDistance: text(100),
  travelMethod: text(100),
  techJourney: essay,
  helpfulFeedback: essay,
  trackInterest: text(100),
  dreamBuild: essay,
  referralSource: text(100),
  anythingElse: essay,
  favoriteFlower: text(60),
  favoriteSnack: text(60),
  excitement: text(10),
  shirtSize: text(20),
  dietary: z.array(z.string().max(100)).max(10).optional(),
  needsHardware: z.boolean().optional(),
});

export type ApplicationDraftData = z.infer<typeof applicationDraftData>;

/**
 * The most a saved draft may weigh as JSON. Each field has its own length cap,
 * so this only bites on text that is many bytes a character; it is what keeps
 * one row small whatever the form sends.
 */
export const MAX_DRAFT_BYTES = 32 * 1024;

export const draftByteLength = (data: ApplicationDraftData) =>
  new TextEncoder().encode(JSON.stringify(data)).length;

/** The input a draft save takes. Unknown keys are stripped before the size is measured. */
export const saveDraftInput = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
  data: applicationDraftData.refine(
    (data) => draftByteLength(data) <= MAX_DRAFT_BYTES,
    "That draft is too large to save.",
  ),
});
