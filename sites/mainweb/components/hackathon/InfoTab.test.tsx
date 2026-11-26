// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Root } from "react-dom/client";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InfoTab } from "./InfoTab";

// The registration form is a separate module that InfoTab loads when it is
// opened, so these run the real InfoTab and the real form together with only
// the session, router and tRPC hooks stubbed. The form loads its school list
// through React Query, so a real client wraps it, as the portal's does.

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

// The first test pays to transform the form and its imports, which takes
// longer than the default when the whole suite is running at once.
vi.setConfig({ testTimeout: 30_000 });

const mocks = vi.hoisted(() => ({
  fetchRecord: vi.fn(),
  invalidate: vi.fn(),
  onSuccess: {} as Record<string, () => void>,
  mutate: {
    register: vi.fn(),
    update: vi.fn(),
    withdraw: vi.fn(),
    confirm: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Ada Lovelace" } },
    status: "authenticated",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => (opts?: { onSuccess?: () => void }) => {
    if (opts?.onSuccess) mocks.onSuccess[name] = opts.onSuccess;
    return {
      isPending: false,
      isSuccess: false,
      isError: false,
      mutate: mocks.mutate[name],
    };
  };
  const query = () => ({ data: undefined, isLoading: false });
  const invalidate = { invalidate: mocks.invalidate };
  return {
    trpc: {
      useUtils: () => ({
        hackathon: {
          myParticipantRecord: { fetch: mocks.fetchRecord, ...invalidate },
          myRegistrations: invalidate,
          list: invalidate,
          getById: invalidate,
        },
      }),
      resume: { me: { useQuery: query } },
      hackathon: {
        myInterest: { useQuery: query },
        // No draft on the server, and saves that go nowhere.
        getMyDraft: { useQuery: () => ({ data: null, isPending: false }) },
        saveMyDraft: {
          useMutation: () => ({ mutateAsync: () => Promise.resolve() }),
        },
        register: { useMutation: mutation("register") },
        updateMyRegistration: { useMutation: mutation("update") },
        withdrawRegistration: { useMutation: mutation("withdraw") },
        confirmAttendance: { useMutation: mutation("confirm") },
      },
    },
  };
});

const hackathon = {
  id: "h1",
  name: "Test Hack",
  description: "About this event.",
  status: "open",
  startDate: "2027-09-17T14:00:00Z",
  endDate: "2027-09-19T22:00:00Z",
  currentParticipants: 0,
};

let root: Root;
let host: HTMLDivElement;

async function mount(
  props: Partial<React.ComponentProps<typeof InfoTab>> = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <InfoTab hackathon={hackathon} isRegistered={false} {...props} />
      </QueryClientProvider>,
    );
  });
}

function button(text: string) {
  const found = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

// The form arrives by a dynamic import, so after the click it is Loading… until
// the module has come in.
async function click(text: string) {
  await act(async () => {
    button(text).click();
  });
  // Cold, the first import also has to be transformed, so wait for it rather
  // than for a fixed time.
  for (let i = 0; i < 100 && host.textContent?.includes("Loading…"); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
}

function field(label: string) {
  const l = [...host.querySelectorAll("label")].find((x) =>
    x.textContent?.startsWith(label),
  );
  const input =
    l && host.querySelector<HTMLInputElement>(`#${CSS.escape(l.htmlFor)}`);
  if (!input) throw new Error(`no field "${label}"`);
  return input;
}

// jsdom does not lay anything out, so it has no scrollIntoView.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

beforeEach(() => {
  scrollIntoView.mockReset();
  localStorage.clear();
  mocks.fetchRecord.mockReset();
  mocks.invalidate.mockReset();
  for (const mutate of Object.values(mocks.mutate)) mutate.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("InfoTab registration form", () => {
  it("opens the form once Start registration is clicked and it has loaded", async () => {
    await mount();
    expect(host.textContent).toContain("About this event.");
    expect(host.textContent).not.toContain("Personal information");

    await click("Start registration");

    expect(host.textContent).toContain("Personal information");
    expect(host.textContent).not.toContain("About this event.");
    expect(scrollIntoView).toHaveBeenCalled();
    // The account name stands in until they type their own.
    expect(field("First name").value).toBe("Ada");
    expect(field("Last name").value).toBe("Lovelace");
  });

  it("restores the saved draft over the account name", async () => {
    localStorage.setItem(
      "reg-draft:h1:u1",
      JSON.stringify({
        firstName: "Grace",
        phone: "(555) 123-4567",
        age: "30",
      }),
    );
    await mount();
    await click("Start registration");

    expect(field("First name").value).toBe("Grace");
    expect(field("Last name").value).toBe("Lovelace");
    expect(field("Phone number").value).toBe("(555) 123-4567");
    expect(field("Age").value).toBe("30");
  });

  it("returns to the overview on Cancel", async () => {
    await mount();
    await click("Start registration");
    expect(host.textContent).toContain("Personal information");

    await click("Cancel");

    expect(host.textContent).not.toContain("Personal information");
    expect(host.textContent).toContain("About this event.");
    expect(button("Start registration")).toBeTruthy();
  });

  it("shows the registration notice once the form reports success", async () => {
    await mount();
    await click("Start registration");

    await act(async () => mocks.onSuccess.register());

    expect(host.textContent).toContain("Registration received");
    expect(host.textContent).not.toContain("Personal information");
  });

  it("edits the saved application, seeding its fields and leaving the draft alone", async () => {
    localStorage.setItem(
      "reg-draft:h1:u1",
      JSON.stringify({ firstName: "Draft" }),
    );
    mocks.fetchRecord.mockResolvedValue({
      firstName: "Saved",
      lastName: "Person",
      phone: "+15551234567",
      age: 22,
    });
    await mount({
      isRegistered: true,
      myReg: { registrationStatus: "pending" },
    });

    await click("Edit application");

    expect(mocks.fetchRecord).toHaveBeenCalledWith(
      { hackathonId: "h1" },
      { staleTime: 0 },
    );
    expect(host.textContent).toContain("Personal information");
    expect(field("First name").value).toBe("Saved");
    expect(field("Last name").value).toBe("Person");
    expect(field("Phone number").value).toBe("(555) 123-4567");
    expect(field("Age").value).toBe("22");
    expect(localStorage.getItem("reg-draft:h1:u1")).toBe(
      JSON.stringify({ firstName: "Draft" }),
    );

    await act(async () => mocks.onSuccess.update());

    expect(host.textContent).toContain("Application updated.");
    expect(host.textContent).not.toContain("Personal information");
  });
});

// Hacklytics ran 26 to 28 February 2027, inside Ramadan. A September event is not.
const duringRamadan = {
  startDate: "2027-02-26T14:00:00Z",
  endDate: "2027-02-28T22:00:00Z",
};
const outsideRamadan = {
  startDate: "2027-09-17T14:00:00Z",
  endDate: "2027-09-19T22:00:00Z",
};

// An application that passes every step, so an edit can walk to the logistics
// step and save without typing.
const savedApplication = {
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+15551234567",
  age: 22,
  usCitizen: "Yes",
  school: "Georgia Tech",
  major: "Computer Science",
  graduationYear: new Date().getFullYear() + 1,
  levelOfStudy: "Junior",
  country: "United States",
  isGtStudent: true,
  isDsgtMember: false,
  attendedHacklyticsBefore: false,
  whyAttend: "To build with data.",
  techJourney: "Two years of coding.",
  helpfulFeedback: "Ask for help sooner.",
  trackInterest: "Not sure yet",
  dreamBuild: "A study spot finder.",
  referralSource: "A friend",
  resumeUrl: "https://example.com/resume.pdf",
  travelReimbursement: false,
  travelFromCity: "Atlanta",
  travelFromCountry: "United States",
  travelDistance: "I'm already in Atlanta",
  travelMethod: "Walk or transit",
  excitement: 8,
  ramadanFasting: "Yes",
};

async function editToLogistics(dates: typeof duringRamadan) {
  mocks.fetchRecord.mockResolvedValue(savedApplication);
  await mount({
    hackathon: { ...hackathon, ...dates },
    isRegistered: true,
    myReg: { registrationStatus: "pending" },
  });
  await click("Edit application");
  for (let step = 0; step < 3; step++) await click("Continue");
}

describe("InfoTab fasting question", () => {
  it("asks it, and sends the answer, for an event that overlaps Ramadan", async () => {
    await editToLogistics(duringRamadan);
    expect(host.textContent).toContain("falls during Ramadan");

    await click("Continue");
    await click("Save changes");

    expect(mocks.mutate.update).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.update.mock.calls[0]?.[0]).toMatchObject({
      ramadanFasting: "Yes",
    });
  });

  it("holds the form at that step until it is answered", async () => {
    mocks.fetchRecord.mockResolvedValue({
      ...savedApplication,
      ramadanFasting: null,
    });
    await mount({
      hackathon: { ...hackathon, ...duringRamadan },
      isRegistered: true,
      myReg: { registrationStatus: "pending" },
    });
    await click("Edit application");
    for (let step = 0; step < 3; step++) await click("Continue");

    await click("Continue");

    expect(host.textContent).toContain("falls during Ramadan");
    expect(host.textContent).toContain(
      "Tell us if you will be fasting during the event.",
    );
  });

  it("does not ask it, or send a stale answer, for an event outside Ramadan", async () => {
    await editToLogistics(outsideRamadan);
    expect(host.textContent).not.toContain("falls during Ramadan");

    await click("Continue");
    await click("Save changes");

    expect(mocks.mutate.update).toHaveBeenCalledTimes(1);
    expect(
      mocks.mutate.update.mock.calls[0]?.[0]?.ramadanFasting,
    ).toBeUndefined();
  });
});
