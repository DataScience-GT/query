import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegistrationControls } from "./RegistrationControls";

// Rendered to markup with the tRPC hooks stubbed, as in DangerZone.test.tsx:
// this is what the server sends, and the browser has to print the same text.

Object.assign(globalThis, { React });

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => false,
}));

vi.mock("@/lib/trpc", () => {
  const query = (data?: unknown) => ({
    useQuery: () => ({ data, refetch: () => undefined }),
  });
  const mutation = {
    useMutation: () => ({
      isPending: false,
      mutate: () => undefined,
      reset: () => undefined,
    }),
  };
  const none = { invalidate: () => undefined };
  return {
    trpc: {
      useUtils: () => ({ hackathon: { getById: none, listAll: none } }),
      hackathon: {
        getById: query({
          status: "closed",
          registrationDeadline: "2026-11-06T02:00:00.000Z",
        }),
        update: mutation,
        notifyRegistrationOpen: mutation,
        registrationOpenEmailStatus: query(),
        interestCount: query(),
      },
    },
  };
});

beforeEach(() => {
  // Cloud Run renders in UTC and an organiser's browser in their own zone.
  vi.stubEnv("TZ", "Pacific/Auckland");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RegistrationControls deadline", () => {
  it("prints the deadline on the venue's clock, whatever zone renders it", () => {
    const html = renderToStaticMarkup(
      <RegistrationControls hackathonId="h1" status="closed" />,
    );
    // 02:00 UTC on 6 Nov is 9 PM on 5 Nov in Atlanta.
    expect(html).toContain("11/5/2026, 9:00:00 PM");
  });
});
