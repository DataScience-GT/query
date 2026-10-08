import { createHash, randomInt } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

export const ROLES = ["volunteer", "organizer", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export type Actor = {
  sub: string;
  email: string;
  name: string;
  org: string | null;
  role: Role | null;
  judgeExternalId: string | null;
};

const ROLE_RANK: Record<Role, number> = {
  volunteer: 0,
  organizer: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(actual: Role | null, minimum: Role): boolean {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function newLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function signActor(
  actor: Actor,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({
    email: actor.email,
    name: actor.name,
    org: actor.org,
    role: actor.role,
    judge_external_id: actor.judgeExternalId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(actor.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyActor(
  token: string,
  options: { secret?: string; jwksUrl?: string },
): Promise<Actor> {
  const verified = options.jwksUrl
    ? await jwtVerify(token, createRemoteJWKSet(new URL(options.jwksUrl)))
    : await jwtVerify(token, new TextEncoder().encode(options.secret ?? ""));
  const payload = verified.payload;
  const email = payload.email;
  const name = payload.name;
  if (typeof email !== "string" || typeof payload.sub !== "string") {
    throw new Error("Token is missing sub or email");
  }
  const role = ROLES.find((item) => item === payload.role) ?? null;
  return {
    sub: payload.sub,
    email,
    name: typeof name === "string" ? name : email,
    org: typeof payload.org === "string" ? payload.org : null,
    role,
    judgeExternalId:
      typeof payload.judge_external_id === "string"
        ? payload.judge_external_id
        : null,
  };
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The strongest role named in the key's scopes. Import and export are organizer work. */
export function roleForScopes(scopes: readonly string[]): Role | null {
  if (scopes.includes("owner")) return "owner";
  if (scopes.includes("admin")) return "admin";
  if (
    scopes.includes("organizer") ||
    scopes.includes("import") ||
    scopes.includes("export") ||
    scopes.includes("webhooks")
  ) {
    return "organizer";
  }
  if (scopes.includes("volunteer")) return "volunteer";
  return null;
}
