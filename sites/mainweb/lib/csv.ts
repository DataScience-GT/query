/**
 * One CSV cell, safe to open in a spreadsheet. These exports carry text typed
 * by strangers (names, schools, free-form answers). A leading = + - @ (or tab
 * or CR) makes Excel and Sheets evaluate the cell as a formula; a leading
 * apostrophe keeps it text. Quotes are doubled, and any cell holding a quote,
 * comma or line break is wrapped.
 */
export const csvCell = (value: unknown): string => {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
