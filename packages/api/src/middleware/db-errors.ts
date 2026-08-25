// Postgres unique_violation. Drizzle wraps every driver error in a
// DrizzleQueryError, which carries no `code` — the pg error holding the
// SQLSTATE sits on `.cause` — so the chain has to be walked. Checking the top
// level silently never matches in production, however well it works against a
// mock that throws a bare `{ code: "23505" }`.
const hasSqlState = (error: unknown, code: string) => {
  for (let cursor = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    if ((cursor as { code?: string }).code === code) return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
};

export const isUniqueViolation = (error: unknown) => hasSqlState(error, "23505");

// Postgres foreign_key_violation. Raised when an ON DELETE RESTRICT reference
// still points at the row being deleted — which is what protects paid club
// memberships from a hackathon delete.
export const isForeignKeyViolation = (error: unknown) =>
  hasSqlState(error, "23503");
