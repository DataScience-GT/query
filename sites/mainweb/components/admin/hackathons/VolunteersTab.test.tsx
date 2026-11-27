// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VolunteersTab } from "./VolunteersTab";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const state = vi.hoisted(() => ({
  readOnly: false,
  list: vi.fn(),
  decide: vi.fn(),
  exportRows: vi.fn(),
  data: undefined as unknown,
}));

vi.mock("@/lib/use-portal-context", () => ({
  READ_ONLY_TITLE: "Read-only",
  useReadOnly: () => state.readOnly,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      volunteer: {
        list: { invalidate: () => undefined },
        exportApplications: { fetch: state.exportRows },
      },
    }),
    volunteer: {
      list: {
        useQuery: (input: unknown, options: { enabled?: boolean }) => {
          state.list(input, options);
          return {
            data: options.enabled === false ? undefined : state.data,
            isLoading: false,
            isError: false,
            error: null,
            refetch: () => undefined,
          };
        },
      },
      decide: {
        useMutation: () => ({
          isPending: false,
          mutate: (input: unknown) => state.decide(input),
        }),
      },
    },
  },
}));

const zero = { approved: 0, pending: 0 };
const coverage = () => ({
  blocks: {
    fri_setup: zero,
    fri_checkin: zero,
    fri_overnight: zero,
    sat_morning: { approved: 1, pending: 1 },
    sat_afternoon: zero,
    sat_evening: zero,
    sat_overnight: zero,
    sun_morning: zero,
    sun_closing: zero,
  },
  roles: {
    check_in: { approved: 1, pending: 0 },
    meals: { approved: 0, pending: 2 },
    workshops: zero,
    help_desk: zero,
    setup: zero,
    judging: zero,
    photography: zero,
  },
  byStatus: { pending: 2, approved: 1, declined: 0, withdrawn: 0 },
});

const application = (id: string, status: string, name: string) => ({
  id,
  userId: `u-${id}`,
  hackathonId: "h1",
  status,
  createdAt: new Date("2027-01-12T15:30:00Z"),
  answers: {
    affiliation: "gt_student",
    availability: ["sat_morning"],
    roles: ["check_in"],
    shirtSize: "M",
    dietary: [],
    phone: "(404) 555-0142",
    acknowledged: true,
  },
  user: {
    id: `u-${id}`,
    name,
    email: `${name.toLowerCase()}@example.com`,
    image: null,
  },
});

let mounted: { root: ReturnType<typeof createRoot>; el: HTMLElement }[] = [];
function render() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounted.push({ root, el });
  act(() =>
    root.render(
      <VolunteersTab
        hackathonId="h1"
        hackathonName="Hacklytics: Digital Bloom"
        startDate="2027-02-26T22:00:00Z"
      />,
    ),
  );
  // A chip or coverage row carries counts after its label, so most presses
  // match the start of the text; "Approve" must not match the "Approved" chip.
  const press = (label: string, exact = false) =>
    act(() =>
      [...el.querySelectorAll("button")]
        .find((b) =>
          exact ? b.textContent === label : b.textContent?.startsWith(label),
        )
        ?.click(),
    );
  return { el, press };
}

describe("VolunteersTab", () => {
  beforeEach(() => {
    state.readOnly = false;
    state.list.mockReset();
    state.decide.mockReset();
    state.exportRows.mockReset();
    state.data = {
      applications: [
        application("a1", "pending", "Ada"),
        application("a2", "approved", "Bo"),
      ],
      coverage: coverage(),
    };
  });
  afterEach(() => {
    for (const { root, el } of mounted) {
      act(() => root.unmount());
      el.remove();
    }
    mounted = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("says approving does not grant scanner access, and where to do that", () => {
    const { el } = render();
    expect(el.textContent).toContain(
      "Approving doesn't give check-in scanner access. Grant that on the Staff page.",
    );
    expect(el.querySelector('a[href="/admin/staff"]')?.textContent).toBe(
      "Staff page",
    );
  });

  it("counts the roster by status, and coverage by block and role", () => {
    const { el } = render();
    expect(el.textContent).toContain(
      "1 approved · 2 pending · 0 declined · 0 withdrawn",
    );
    expect(el.textContent).toContain(
      "Saturday, Feb 27: Morning1 approved, 1 pending",
    );
    expect(el.textContent).toContain("Meals and snacks0 approved, 2 pending");
  });

  it("filters by the status chips and by pressing a block or a role", () => {
    const { press } = render();
    press("Pending");
    expect(state.list).toHaveBeenLastCalledWith(
      {
        hackathonId: "h1",
        status: "pending",
        role: undefined,
        block: undefined,
      },
      expect.anything(),
    );
    press("Meals and snacks");
    press("Saturday, Feb 27: Morning");
    expect(state.list).toHaveBeenLastCalledWith(
      {
        hackathonId: "h1",
        status: "pending",
        role: "meals",
        block: "sat_morning",
      },
      expect.anything(),
    );
    // Pressing it again lets go.
    press("Meals and snacks");
    expect(state.list).toHaveBeenLastCalledWith(
      {
        hackathonId: "h1",
        status: "pending",
        role: undefined,
        block: "sat_morning",
      },
      expect.anything(),
    );
    press("Clear filters");
    expect(state.list).toHaveBeenLastCalledWith(
      {
        hackathonId: "h1",
        status: undefined,
        role: undefined,
        block: undefined,
      },
      expect.anything(),
    );
  });

  it("approves and declines from the row, offering only what would change", () => {
    const { el, press } = render();
    const rows = [...el.querySelectorAll("li")].filter((li) =>
      li.textContent?.includes("@example.com"),
    );
    const labels = (li: Element | undefined) =>
      [...(li?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    // A pending row can go either way; an approved one can only be declined.
    expect(labels(rows[0])).toEqual(["Details", "Approve", "Decline"]);
    expect(labels(rows[1])).toEqual(["Details", "Decline"]);

    press("Approve", true);
    expect(state.decide).toHaveBeenCalledWith({
      applicationId: "a1",
      decision: "approved",
    });
  });

  it("opens a volunteer's answers, phone included", () => {
    const { el, press } = render();
    expect(el.textContent).not.toContain("(404) 555-0142");
    press("Details");
    expect(el.textContent).toContain("(404) 555-0142");
    // The dates the blocks mean.
    expect(el.textContent).toContain("Friday, Feb 26");
  });

  it("downloads the filtered roster as a CSV", async () => {
    state.exportRows.mockResolvedValue([application("a1", "pending", "Ada")]);
    const created: Blob[] = [];
    // Only the two blob helpers: next/image builds URLs with the real one.
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => (created.push(blob), "blob:x"),
      revokeObjectURL: () => undefined,
    });
    // jsdom cannot follow the download link; this only keeps it quiet.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    const { press } = render();
    await act(async () => press("Export CSV"));
    expect(state.exportRows).toHaveBeenCalledWith({
      hackathonId: "h1",
      status: undefined,
      role: undefined,
      block: undefined,
    });
    expect(created).toHaveLength(1);
    expect(await created[0]?.text()).toContain("ada@example.com");
  });

  it("turns a bug tester away without asking for the roster", () => {
    state.readOnly = true;
    const { el } = render();
    expect(el.textContent).toContain("bug testers can't open this tab");
    expect(state.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("says what is missing when nobody has applied", () => {
    state.data = {
      applications: [],
      coverage: {
        ...coverage(),
        byStatus: { pending: 0, approved: 0, declined: 0, withdrawn: 0 },
      },
    };
    const { el } = render();
    expect(el.textContent).toContain("No volunteer applications yet.");
  });
});
