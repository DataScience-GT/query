import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhoneAsTyped, phoneDigits } from "./phone";

describe("normalizePhone", () => {
  it("stores one number the same way however it was typed", () => {
    const spellings = [
      "4045550199",
      "404-555-0199",
      "(404) 555-0199",
      "404.555.0199",
      " 404 555 0199 ",
      "+1 404 555 0199",
      "1-404-555-0199",
    ];
    for (const spelling of spellings) {
      expect(normalizePhone(spelling)).toBe("+14045550199");
    }
  });

  it("keeps a country code the applicant typed", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("does not invent +1 for a number that is not ten digits", () => {
    expect(normalizePhone("5550199")).toBe("+5550199");
  });

  it("returns empty for input with no digits", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("(   ) -")).toBe("");
  });
});

describe("formatPhoneAsTyped", () => {
  it("grows into US shape one digit at a time", () => {
    expect(formatPhoneAsTyped("4")).toBe("(4");
    expect(formatPhoneAsTyped("404")).toBe("(404");
    expect(formatPhoneAsTyped("4045")).toBe("(404) 5");
    expect(formatPhoneAsTyped("404555")).toBe("(404) 555");
    expect(formatPhoneAsTyped("4045550199")).toBe("(404) 555-0199");
  });

  it("survives being fed its own output, since it is", () => {
    expect(formatPhoneAsTyped(formatPhoneAsTyped("4045550199"))).toBe(
      "(404) 555-0199",
    );
  });

  it("keeps deleting possible — no digits means empty, not punctuation", () => {
    expect(formatPhoneAsTyped("(")).toBe("");
  });

  it("leaves international input alone", () => {
    expect(formatPhoneAsTyped("+44 7911 123456")).toBe("+447911123456");
    expect(formatPhoneAsTyped("1 404 555 0199")).toBe("+1 (404) 555-0199");
  });

  it("does not silently drop digits past a US number's length", () => {
    expect(phoneDigits(formatPhoneAsTyped("447911123456"))).toBe(
      "447911123456",
    );
  });
});
