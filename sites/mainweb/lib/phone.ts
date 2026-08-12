export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * What gets stored: E.164, e.g. "+14045550199". Ten bare digits are US; eleven
 * starting with 1 already carry the country code.
 */
export function normalizePhone(raw: string): string {
  const digits = phoneDigits(raw);
  if (!digits) return "";
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** What the applicant sees while typing; international input is left plain. */
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
