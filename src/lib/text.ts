const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Plain text only: block-level tags become line breaks, all other tags and
 * control characters are removed (newlines and tabs are kept).
 */
export function toPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(CONTROL, "")
    .trim();
}
