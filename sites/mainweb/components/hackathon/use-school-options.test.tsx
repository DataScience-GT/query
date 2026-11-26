// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCHOOLS } from "@/components/hackathon/constants";
import { useSchoolOptions } from "./use-school-options";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const FULL = ["Alpha College", "Beta University"];

let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn<(url: string) => Promise<unknown>>();

function Probe({ enabled }: { enabled: boolean }) {
  return <p>{useSchoolOptions(enabled).join("|")}</p>;
}

const shown = () => host.textContent;

// Renders, then lets the fetch and the query's own scheduling settle.
async function render(enabled: boolean) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe enabled={enabled} />
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

let client: QueryClient;

const reply = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    statusText: ok ? "OK" : "Not Found",
    json: async () => body,
  });

beforeEach(() => {
  client = new QueryClient();
  host = document.createElement("div");
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

describe("useSchoolOptions", () => {
  it("shows the short list and fetches nothing until the academic step opens", async () => {
    await render(false);
    expect(shown()).toBe(SCHOOLS.join("|"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swaps in the full list once enabled, fetching it once", async () => {
    fetchMock.mockImplementation(() => reply(FULL));

    await render(false);
    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/schools.json");
    expect(shown()).toBe(FULL.join("|"));

    // Leaving the step and coming back must not fetch a second time.
    await render(false);
    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(FULL.join("|"));
  });

  it.each([
    ["a failed request", () => reply({}, false)],
    ["an empty list", () => reply([])],
    ["something that is not a list", () => reply({ schools: FULL })],
    ["a network error", () => Promise.reject(new Error("offline"))],
  ])("keeps the short list after %s", async (_name, response) => {
    fetchMock.mockImplementation(response);

    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(SCHOOLS.join("|"));
  });
});
