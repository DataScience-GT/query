import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@query/api";

/**
 * tRPC reports an input-validation failure with a JSON dump of the raw Zod
 * issues as its message, which is unreadable in a UI. The API's error formatter
 * attaches the flattened form alongside it, so prefer that when it is present.
 */
export function trpcErrorMessage(
  error: TRPCClientErrorLike<AppRouter> | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;

  const zodError = error.data?.zodError;
  if (zodError) {
    const issues = [
      ...zodError.formErrors,
      ...Object.values(zodError.fieldErrors).flat(),
    ].filter((issue): issue is string => !!issue);
    if (issues.length > 0) return issues.join(" ");
  }

  return error.message || fallback;
}
