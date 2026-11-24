/**
 * The first paragraph of an edition's description. The full text is the About
 * section on the application page; the summary under a title and the link
 * preview take only its opening paragraph.
 */
export function firstParagraph(text: string | null | undefined) {
  const first = text?.split(/\n\s*\n/)[0]?.trim();
  return first || null;
}
