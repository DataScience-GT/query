/** Saves `blob` through the browser as a file named `fileName`. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // The blob is retained until its URL is revoked; without this every export
  // leaks its contents for the lifetime of the page.
  URL.revokeObjectURL(url);
}
