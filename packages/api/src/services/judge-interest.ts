import { z } from "zod";
import { judgeInterest } from "@query/db";
import type { DrizzleDB } from "@query/db";

// The public "I might judge" form on the Hacklytics site. The validation, the
// upsert and the CORS rule live here so the route handler stays thin and the
// rules can be tested without Next.

/** The edition the form is for. The hackathon row may not exist yet. */
export const JUDGE_INTEREST_EDITION = "hacklytics-2027";

/**
 * Origins allowed to post. The production site and Firebase's default hosts for
 * the same site. A local portal also accepts the local dev servers (Astro dev
 * 3000, preview 4321); the deployed one does not, so a local page cannot write
 * to the real list.
 */
const ALLOWED_ORIGINS = new Set([
  "https://hacklytics.io",
  "https://www.hacklytics.io",
  "https://hacklytics2027.web.app",
  "https://hacklytics2027.firebaseapp.com",
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:4321",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4321",
      ]),
]);

export const isAllowedJudgeInterestOrigin = (origin: string | null) =>
  origin !== null && ALLOWED_ORIGINS.has(origin);

/** An empty string from an untouched field is "not given". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => (value ? value : undefined));

const linkedinUrl = z
  .string()
  .trim()
  .max(300, "Keep the LinkedIn link under 300 characters.")
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => {
      if (value === undefined) return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    "Enter a full link, like https://www.linkedin.com/in/your-name.",
  );

export const judgeInterestInput = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  company: z.string().trim().min(1, "Enter your company.").max(160),
  title: optionalText(160),
  expertise: optionalText(300),
  linkedinUrl,
  message: optionalText(1000),
  /** Honeypot: hidden from people, so only a bot fills it. */
  website: z.string().max(500).optional(),
});

export type JudgeInterestInput = z.infer<typeof judgeInterestInput>;

/** Insert, or update the existing row for this email on this edition. */
export async function upsertJudgeInterest(
  db: DrizzleDB,
  input: Omit<JudgeInterestInput, "website">,
) {
  const values = {
    edition: JUDGE_INTEREST_EDITION,
    name: input.name,
    email: input.email,
    company: input.company,
    title: input.title ?? null,
    expertise: input.expertise ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    message: input.message ?? null,
  };
  await db
    .insert(judgeInterest)
    .values(values)
    .onConflictDoUpdate({
      target: [judgeInterest.edition, judgeInterest.email],
      set: {
        name: values.name,
        company: values.company,
        title: values.title,
        expertise: values.expertise,
        linkedinUrl: values.linkedinUrl,
        message: values.message,
        updatedAt: new Date(),
      },
    });
}
