import { toFils, type Fils } from "@filspay/money";
import { BadRequestError, NotFoundError } from "./errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: unknown, notFoundCode?: string): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    if (notFoundCode) throw new NotFoundError(notFoundCode);
    throw new BadRequestError("invalid_request", "a valid UUID is required");
  }
}

export function positiveMoney(value: unknown): Fils {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new BadRequestError("invalid_amount", "amountFils must be a positive safe integer");
  }
  return toFils(value);
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assertCalendarRange(from: unknown, to: unknown): asserts from is string {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from >= to) {
    throw new BadRequestError("invalid_date", "from/to must be real YYYY-MM-DD dates with from before to");
  }
}

/** ISO instant, explicit timezone; preserve the caller's sub-millisecond text for cursors. */
export function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)) return false;
  if (!isCalendarDate(value.slice(0, 10))) return false;
  const time = value.slice(11, 19);
  if (Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59 || Number(time.slice(6, 8)) > 59) return false;
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return Number.isFinite(Date.parse(normalized));
}

export function optionalInstant(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (!isInstant(value)) throw new BadRequestError("invalid_date", "an ISO timestamp with timezone is required");
  return new Date((value as string).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
}

export function assertInstantRange(from: Date | undefined, to: Date | undefined): void {
  if (from && to && from >= to) throw new BadRequestError("invalid_date", "from must precede to");
}

/** Retain existing per-query clamps, but never turn junk or NaN into SQL limits. */
export function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestError("invalid_limit", "limit must be an integer");
  }
  return Number(value);
}

export function validateCursor(cursor: unknown, kind: "instant" | "date"): void {
  if (cursor === undefined) return;
  if (typeof cursor !== "string" || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new BadRequestError("invalid_cursor");
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (Buffer.from(decoded).toString("base64url") !== cursor) throw new BadRequestError("invalid_cursor");
  const parts = decoded.split("|");
  if (parts.length !== 2 || !(kind === "date" ? isCalendarDate(parts[0]) : isInstant(parts[0])) || !UUID_RE.test(parts[1]!)) {
    throw new BadRequestError("invalid_cursor");
  }
}
