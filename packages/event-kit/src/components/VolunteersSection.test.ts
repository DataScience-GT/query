import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { EventConfig } from "../config";
import { SECTION_NAV } from "../nav";
import VolunteersSection from "./VolunteersSection";

// The section is a plain function component, so calling it gives its element.
// It reads only `volunteers`, so that is all the config here carries.
const config = (volunteers?: {
  body: [string];
  cta?: { label: string; href: string };
}) => ({ volunteers }) as unknown as EventConfig;

// The elements of a rendered tree that are links, found without a DOM.
const anchors = (node: unknown): ReactElement<{ href?: string; children?: unknown }>[] => {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(anchors);
  const element = node as ReactElement<{ href?: string; children?: unknown }>;
  const here = element.type === "a" ? [element] : [];
  return [...here, ...anchors(element.props?.children)];
};

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

  it("has no button unless the config gives one", () => {
    const section = VolunteersSection({ event: config({ body: ["Help out."] }) });
    expect(anchors(section)).toEqual([]);
  });

  it("draws the one button, to the application, when the config gives it", () => {
    const section = VolunteersSection({
      event: config({
        body: ["Help out."],
        cta: { label: "Apply to volunteer", href: "https://example.org/volunteer" },
      }),
    });
    const [button, ...others] = anchors(section);
    expect(others).toEqual([]);
    expect(button?.props.href).toBe("https://example.org/volunteer");
    expect(button?.props.children).toBe("Apply to volunteer");
  });

  it("is not in the nav, which is full: the navbar and footer link only to SECTION_NAV", () => {
    expect(SECTION_NAV.map((s) => s.id)).not.toContain("volunteers");
  });
});
