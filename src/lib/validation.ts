export const VALID_TYPES = [
  "STOCK",
  "MUTUAL_FUND",
  "FD",
  "GOLD",
  "REAL_ESTATE",
  "OTHER",
] as const;

export type HoldingType = (typeof VALID_TYPES)[number];

export function isValidType(value: unknown): value is HoldingType {
  return typeof value === "string" && (VALID_TYPES as readonly string[]).includes(value);
}
