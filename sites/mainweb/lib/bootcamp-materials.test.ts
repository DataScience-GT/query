import { describe, it, expect } from "vitest";
import {
  MAX_MATERIAL_BYTES,
  formatMaterialSize,
  materialContentDisposition,
  materialContentType,
  materialExtension,
  materialFileName,
  materialStorageKey,
} from "./bootcamp-materials";

describe("materialExtension", () => {
  it("takes what follows the last dot, lowercased", () => {
    expect(materialExtension("Week 3 Slides.PDF")).toBe("pdf");
    expect(materialExtension("archive.tar.gz")).toBe("gz");
  });

  it("finds none in a name with no usable dot", () => {
    expect(materialExtension("README")).toBe("");
    expect(materialExtension("trailing.")).toBe("");
    // A dotfile is all extension and no name; treat it as neither.
    expect(materialExtension(".gitignore")).toBe("");
  });
});

describe("materialContentType", () => {
  it("types the kinds a session hands out", () => {
    expect(materialContentType("slides.pdf")).toBe("application/pdf");
    expect(materialContentType("week1.ipynb")).toBe("application/x-ipynb+json");
    expect(materialContentType("titanic.csv")).toBe("text/csv");
  });

  it("refuses anything a browser would render as markup", () => {
    expect(materialContentType("page.html")).toBeNull();
    expect(materialContentType("logo.svg")).toBeNull();
    expect(materialContentType("run.sh")).toBeNull();
    expect(materialContentType("noextension")).toBeNull();
  });
});

describe("materialFileName", () => {
  it("decodes what the upload encoded", () => {
    expect(materialFileName(encodeURIComponent("Résumé du cours.pdf"))).toBe(
      "Résumé du cours.pdf",
    );
  });

  it("keeps a path out of the name", () => {
    expect(materialFileName("../../etc/passwd")).toBe("passwd");
    expect(materialFileName("C:\\Users\\me\\slides.pdf")).toBe("slides.pdf");
  });

  it("drops a header injection attempt rather than carrying it", () => {
    expect(materialFileName("ok.pdf\r\nX-Evil: 1")).toBe("ok.pdf");
  });

  it("falls back rather than returning nothing", () => {
    expect(materialFileName(null)).toBe("material");
    expect(materialFileName("   ")).toBe("material");
    expect(materialFileName("...")).toBe("material");
  });

  it("survives a truncated percent escape", () => {
    expect(materialFileName("slides%.pdf")).toBe("slides%.pdf");
  });
});

describe("materialStorageKey", () => {
  it("names the object after the row, not the upload", () => {
    expect(materialStorageKey("event-1", "mat-1", "Week 3 Slides.pdf")).toBe(
      "sessions/event-1/mat-1.pdf",
    );
  });

  it("leaves off an extension there is none of", () => {
    expect(materialStorageKey("event-1", "mat-1", "handout")).toBe(
      "sessions/event-1/mat-1",
    );
  });
});

describe("materialContentDisposition", () => {
  it("sends the file as an attachment under both spellings", () => {
    const header = materialContentDisposition("Week 3.pdf");
    expect(header).toContain('attachment; filename="Week 3.pdf"');
    expect(header).toContain("filename*=UTF-8''Week%203.pdf");
  });

  it("keeps a quote out of the quoted form", () => {
    expect(materialContentDisposition('a"b.pdf')).toContain(
      'filename="a\'b.pdf"',
    );
  });

  it("transliterates what the quoted form cannot carry", () => {
    const header = materialContentDisposition("résumé.pdf");
    expect(header).toContain('filename="r_sum_.pdf"');
    expect(header).toContain(encodeURIComponent("résumé.pdf"));
  });
});

describe("formatMaterialSize", () => {
  it("reads the way a download prompt does", () => {
    expect(formatMaterialSize(512)).toBe("512 B");
    expect(formatMaterialSize(2048)).toBe("2 KB");
    expect(formatMaterialSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatMaterialSize(MAX_MATERIAL_BYTES)).toBe("25.0 MB");
  });
});
