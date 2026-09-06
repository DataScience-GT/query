import { memberResumes, members, users } from "@query/db";
import { and, asc, count, eq, gt, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

export type ResumeScope = "members" | "all";

export type ResumeFilters = {
  scope: ResumeScope;
  search?: string;
  gradYear?: number;
  /** An explicit hand-picked set, instead of everything the filters match. */
  userIds?: string[];
};

/** GET query-string cap; a longer list would blow past URL limits anyway. */
export const MAX_RESUME_BOOK_IDS = 200;

/** `%` and `_` are LIKE wildcards; they are not a search for those characters. */
export function searchNeedle(search: string | undefined) {
  const needle = search?.replace(/[%_\\]/g, "").replace(/\s+/g, " ").trim();
  return needle || undefined;
}

export function parseResumeBookIds(raw: string | null | undefined) {
  if (!raw) return undefined;
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return undefined;
  return ids.slice(0, MAX_RESUME_BOOK_IDS);
}

/**
 * `members` is a paid, unexpired membership — the same rule checkStatus uses.
 * `all` is everyone who uploaded.
 */
const whereFor = (filters: ResumeFilters, now: Date) => {
  const needle = searchNeedle(filters.search);
  const pattern = needle ? `%${needle}%` : null;

  return and(
    filters.userIds?.length
      ? inArray(memberResumes.userId, filters.userIds)
      : undefined,
    filters.scope === "members"
      ? and(
          eq(members.isActive, true),
          isNotNull(members.membershipEndDate),
          gt(members.membershipEndDate, now),
        )
      : undefined,
    filters.gradYear ? eq(members.graduationYear, filters.gradYear) : undefined,
    pattern
      ? or(
          ilike(users.name, pattern),
          ilike(users.email, pattern),
          ilike(members.firstName, pattern),
          ilike(members.lastName, pattern),
          ilike(members.major, pattern),
        )
      : undefined,
  );
};

const displayName = (row: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email?: string | null;
}) =>
  row.firstName && row.lastName
    ? `${row.firstName} ${row.lastName}`
    : (row.name ?? row.email ?? "Unknown");

/**
 * Shared by the staff table and the ZIP route so a book can never contain
 * someone the list said it would not.
 */
export async function listResumes(
  db: DrizzleDB,
  filters: ResumeFilters,
  page?: { limit: number; offset: number },
) {
  const now = new Date();

  const query = db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      firstName: members.firstName,
      lastName: members.lastName,
      school: members.school,
      major: members.major,
      graduationYear: members.graduationYear,
      isMemberActive: members.isActive,
      membershipEndDate: members.membershipEndDate,
      storageKey: memberResumes.storageKey,
      fileName: memberResumes.fileName,
      sizeBytes: memberResumes.sizeBytes,
      uploadedAt: memberResumes.uploadedAt,
    })
    .from(memberResumes)
    .innerJoin(users, eq(users.id, memberResumes.userId))
    .leftJoin(members, eq(members.userId, memberResumes.userId))
    .where(whereFor(filters, now))
    // Nulls last so members with no club profile sort after the named ones.
    .orderBy(sql`${members.lastName} asc nulls last`, asc(users.name));

  const rows = await (page
    ? query.limit(page.limit).offset(page.offset)
    : query);

  return rows.map((row) => ({
    ...row,
    isCurrentMember: Boolean(
      row.isMemberActive &&
        row.membershipEndDate &&
        row.membershipEndDate > now,
    ),
    displayName: displayName(row),
  }));
}

/** How many the filters match, for "download all N" when the table shows 100. */
export async function countResumes(db: DrizzleDB, filters: ResumeFilters) {
  const rows = await db
    .select({ total: count() })
    .from(memberResumes)
    .innerJoin(users, eq(users.id, memberResumes.userId))
    .leftJoin(members, eq(members.userId, memberResumes.userId))
    .where(whereFor(filters, new Date()));

  return rows[0]?.total ?? 0;
}
