import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@query/api";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) => createContext({ ...opts, req }),
    onError({ path, error }) {
      // Log internal errors server-side so the real cause appears in Cloud Run logs.
      // 4xx errors (BAD_REQUEST, NOT_FOUND, UNAUTHORIZED, etc.) are expected — skip them.
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(
          `[tRPC] INTERNAL_SERVER_ERROR on ${path ?? "unknown"}:`,
          error.message,
          error.cause,
        );
      }
    },
  });

export { handler as GET, handler as POST };
