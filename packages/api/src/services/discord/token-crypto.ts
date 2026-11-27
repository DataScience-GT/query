import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

// Discord OAuth tokens at rest. AES-256-GCM, with a key derived from AUTH_SECRET
// through HKDF under its own label, so no new secret is needed and the key is
// never the one that signs sessions or the OAuth state. Each value carries its
// own random IV, and the person's id is authenticated data, so a ciphertext
// moved to another person's row fails to open. Rotating AUTH_SECRET makes
// stored tokens unreadable, which leaves those links as unrevocable as ones
// made before tokens were stored.

const INFO = "query/discord/token/v1";
const VERSION = "v1";

const keyFrom = (secret: string) =>
  Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), INFO, 32));

const aadFor = (userId: string) => Buffer.from(`discord_link:${userId}`);

/** `v1.<iv>.<ciphertext>.<tag>`, base64url. */
export function sealToken(
  plain: string,
  secret: string,
  userId: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(aadFor(userId));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The plain token, or null when the value is malformed, tampered with, or sealed under another key or person. */
export function openToken(
  sealed: string | null | undefined,
  secret: string,
  userId: string,
): string | null {
  if (!sealed) return null;
  const [version, iv, ciphertext, tag, extra] = sealed.split(".");
  if (version !== VERSION || !iv || !ciphertext || !tag || extra !== undefined) {
    return null;
  }
  try {
    // A fixed tag length, or a truncated tag would be accepted.
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFrom(secret),
      Buffer.from(iv, "base64url"),
      { authTagLength: 16 },
    );
    decipher.setAAD(aadFor(userId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
