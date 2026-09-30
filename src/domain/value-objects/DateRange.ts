import { InvalidDateRangeError } from "../errors/DomainErrors.js";

/**
 * A validated, immutable date range.
 *
 * Why a value object instead of two raw Date fields on the entity:
 * - Validation (start <= end, no past dates) happens exactly once, at
 *   construction. Once you hold a DateRange, it is guaranteed valid —
 *   nothing downstream needs to re-check it.
 * - Business-day counting (the number that actually matters for leave
 *   policy) lives next to the dates it operates on, not scattered
 *   across use cases.
 * - Equality and overlap checks are given real names instead of being
 *   re-derived with ad-hoc comparisons wherever they're needed.
 */
export class DateRange {
  private constructor(
    public readonly start: Date,
    public readonly end: Date
  ) {}

  static create(start: Date, end: Date, referenceNow: Date = new Date()): DateRange {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new InvalidDateRangeError("Start and end dates must be valid dates.");
    }
    if (start > end) {
      throw new InvalidDateRangeError("Start date must be before or equal to end date.");
    }
    const today = new Date(referenceNow);
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      throw new InvalidDateRangeError("Start date cannot be in the past.");
    }
    return new DateRange(start, end);
  }

  /** Inclusive count of weekdays (Mon–Fri) between start and end. */
  businessDays(): number {
    let count = 0;
    const cursor = new Date(this.start);
    while (cursor <= this.end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  overlaps(other: DateRange): boolean {
    return this.start <= other.end && other.start <= this.end;
  }

  equals(other: DateRange): boolean {
    return this.start.getTime() === other.start.getTime() && this.end.getTime() === other.end.getTime();
  }

  toString(): string {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return `${fmt(this.start)} → ${fmt(this.end)}`;
  }
}
