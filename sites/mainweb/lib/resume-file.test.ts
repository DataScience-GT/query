import { describe, it, expect } from "vitest";
import {
  looksLikePdf,
  resumeFileName,
  uniqueZipName,
  decodeStoredFileName,
  parseResumeIds,
  MAX_BOOK_IDS,
  MAX_RESUME_BYTES,
} from "./resume-file";

const bytes = (...values: number[]) => new Uint8Array(values);
const fromAscii = (text: string) =>
  new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("looksLikePdf", () => {
  it("accepts a real PDF header", () => {
    expect(looksLikePdf(fromAscii("%PDF-1.7\n%\xE2\xE3\xCF\xD3"))).toBe(true);
  });

  it("rejects a file that is only a PDF by its name", () => {
    expect(looksLikePdf(fromAscii("PKrest of a zip"))).toBe(false);
    expect(looksLikePdf(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe(false);
    expect(looksLikePdf(fromAscii("#!/bin/sh\nrm -rf /"))).toBe(false);
  });

  it("rejects a truncated header rather than reading past the end", () => {
    expect(looksLikePdf(fromAscii("%PDF"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });

  it("caps a resume at 2MB", () => {
    expect(MAX_RESUME_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("resumeFileName", () => {
  it("files by the member's name", () => {
    expect(resumeFileName("Ada Lovelace")).toBe("Ada Lovelace.pdf");
  });

  it("keeps names in every script", () => {
    expect(resumeFileName("张伟")).toBe("张伟.pdf");
    expect(resumeFileName("José Álvarez-Núñez")).toBe("José Álvarez-Núñez.pdf");
  });

  it("strips what would break out of a Content-Disposition header", () => {
    const escaped = resumeFileName('Bad"; filename="owned\r\nX-Evil: 1');
    expect(escaped).not.toMatch(/["\r\n;]/);
    expect(escaped.endsWith(".pdf")).toBe(true);
  });

  it("strips path separators, which are ZIP entry traversal", () => {
    expect(resumeFileName("../../etc/passwd")).toBe("....etcpasswd.pdf");
    expect(resumeFileName("a/b\\c")).toBe("abc.pdf");
  });

  it("never returns a bare extension when nothing survives", () => {
    expect(resumeFileName("///")).toBe("resume.pdf");
    expect(resumeFileName("")).toBe("resume.pdf");
    expect(resumeFileName(null)).toBe("resume.pdf");
  });
});

describe("uniqueZipName", () => {
  it("suffixes duplicates instead of overwriting on extract", () => {
    const taken = new Set<string>();
    expect(uniqueZipName(taken, "Wei Chen")).toBe("Wei Chen.pdf");
    expect(uniqueZipName(taken, "Wei Chen")).toBe("Wei Chen (2).pdf");
    expect(uniqueZipName(taken, "Wei Chen")).toBe("Wei Chen (3).pdf");
  });

  it("treats case-insensitive collisions as collisions", () => {
    // Windows and macOS extract onto case-insensitive filesystems, where
    // `wei chen.pdf` would silently replace `Wei Chen.pdf`.
    const taken = new Set<string>();
    expect(uniqueZipName(taken, "Wei Chen")).toBe("Wei Chen.pdf");
    expect(uniqueZipName(taken, "wei chen")).toBe("wei chen (2).pdf");
  });

  it("keeps distinct names distinct across thousands of entries", () => {
    const taken = new Set<string>();
    const names = Array.from({ length: 5000 }, (_, i) =>
      uniqueZipName(taken, `Person ${i}`),
    );
    expect(new Set(names).size).toBe(5000);
  });
});

describe("decodeStoredFileName", () => {
  it("reads back what the uploader encoded", () => {
    expect(decodeStoredFileName("Ada%20Lovelace%20resume.pdf")).toBe(
      "Ada Lovelace resume.pdf",
    );
    expect(decodeStoredFileName("%E5%BC%A0%E4%BC%9F.pdf")).toBe("张伟.pdf");
  });

  it("returns a malformed escape as-is instead of throwing in a render", () => {
    expect(decodeStoredFileName("100%.pdf")).toBe("100%.pdf");
    expect(decodeStoredFileName("%E0%A4%A.pdf")).toBe("%E0%A4%A.pdf");
  });
});

describe("parseResumeIds", () => {
  it("reads a hand-picked selection", () => {
    expect(parseResumeIds("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("means no explicit set when the parameter is absent or empty", () => {
    expect(parseResumeIds(null)).toBeUndefined();
    expect(parseResumeIds("")).toBeUndefined();
    expect(parseResumeIds(",,,")).toBeUndefined();
  });

  it("deduplicates so one id cannot be asked for twice", () => {
    expect(parseResumeIds("a,b,a")).toEqual(["a", "b"]);
  });

  it("caps the IN list a crafted URL can ask for", () => {
    const many = Array.from({ length: MAX_BOOK_IDS + 500 }, (_, i) => `id${i}`);
    expect(parseResumeIds(many.join(","))?.length).toBe(MAX_BOOK_IDS);
  });
});
