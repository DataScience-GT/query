/**
 * Phone numbers as applicants actually type them.
 *
 * The field used to store the raw string, so the same person arrived as
 * "404-555-0199", "(404) 555 0199", "+1 404.555.0199" and "4045550199" — four
 * spellings of one number that no organiser could sort, dedupe or paste into a
 * texting tool. Everything is reduced to digits and rebuilt from there.
 */

/** Just the digits, so callers can count them without re-writing the regex. */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * What gets stored: E.164, e.g. "+14045550199".
 *
 * A bare 10-digit number is US — the event is national and that is the only
 * reading of ten digits. Eleven starting with 1 is the same number with the
 * country code already typed. Anything else keeps its own country code, whether
 * or not the applicant typed the "+".
 */
export function normalizePhone(raw: string): string {
  const digits = phoneDigits(raw);
  if (!digits) return "";
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/**
 * What the applicant sees while typing: US numbers grow into
 * "(404) 555-0199", anything longer is left as a plain international string.
 *
 * Formatting as they type is what makes the stripping visible — a field that
 * silently rewrites its contents on submit reads as a bug.
 */
export function formatPhoneAsTyped(raw: string): string {
  const digits = phoneDigits(raw);
  if (!digits) return "";

  const international = raw.trim().startsWith("+") || digits.length > 11;
  if (international) return `+${digits}`;

  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const prefix = us !== digits ? "+1 " : "";

  if (us.length <= 3) return `${prefix}(${us}`;
  if (us.length <= 6) return `${prefix}(${us.slice(0, 3)}) ${us.slice(3)}`;
  return `${prefix}(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6, 10)}`;
}
