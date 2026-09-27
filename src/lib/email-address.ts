/**
 * Conservative email syntax check. Rejects whitespace, control characters,
 * multiple addresses and display-name forms so a single stored value can
 * never expand into several recipients or inject headers.
 */
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value) && !value.includes("..");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
