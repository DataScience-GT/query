import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { EventConfig } from "../config";
import { SECTION_NAV } from "../nav";
import VolunteersSection from "./VolunteersSection";

// The section is a plain function component, so calling it gives its element.
// It reads only `volunteers`, so that is all the config here carries.
const config = (volunteers?: { body: [string] }) => ({ volunteers }) as unknown as EventConfig;

describe("VolunteersSection", () => {
  it("renders nothing when the edition has no volunteers, so an edition without them is unchanged", () => {
    expect(VolunteersSection({ event: config() })).toBeNull();
  });

  it("renders the section, found at #volunteers, when it does", () => {
    const section = VolunteersSection({
      event: config({ body: ["Help out."] }),
    }) as ReactElement<{ id: string }>;
    expect(section).not.toBeNull();
    expect(section.props.id).toBe("volunteers");
  });

  it("is not in the nav, which is full: the navbar and footer link only to SECTION_NAV", () => {
    expect(SECTION_NAV.map((s) => s.id)).not.toContain("volunteers");
  });
});
