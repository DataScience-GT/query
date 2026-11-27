import { TRPCError } from "@trpc/server";

// One-line constructors for the errors the routers throw most.
const failWith = (code: ConstructorParameters<typeof TRPCError>[0]["code"]) =>
  (message: string) => new TRPCError({ code, message });

export const notFound = failWith("NOT_FOUND");
export const badRequest = failWith("BAD_REQUEST");
export const conflict = failWith("CONFLICT");
export const forbidden = failWith("FORBIDDEN");
export const preconditionFailed = failWith("PRECONDITION_FAILED");
