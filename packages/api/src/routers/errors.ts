import { TRPCError } from "@trpc/server";

export const notFound = (message: string) =>
  new TRPCError({ code: "NOT_FOUND", message });
