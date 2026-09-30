/**
 * Domain-level errors.
 *
 * These are NOT HTTP errors. The domain doesn't know what a "400" is.
 * The HTTP layer (infrastructure/http) will translate each of these
 * into the appropriate status code + payload. Keeping them here means
 * the domain stays framework-agnostic and the mapping is explicit,
 * in one place, instead of scattered `throw new Error("...")` calls
 * that the API layer has to guess about.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = "INVALID_TRANSITION";
  constructor(from: string, to: string) {
    super(`Cannot transition leave request from "${from}" to "${to}".`);
  }
}

export class UnauthorizedActionError extends DomainError {
  readonly code = "UNAUTHORIZED_ACTION";
  constructor(action: string, reason: string) {
    super(`Not authorized to perform "${action}": ${reason}`);
  }
}

export class InvalidDateRangeError extends DomainError {
  readonly code = "INVALID_DATE_RANGE";
  constructor(message: string) {
    super(message);
  }
}

export class OverlappingLeaveError extends DomainError {
  readonly code = "OVERLAPPING_LEAVE";
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" already has an active leave request overlapping this period.`);
  }
}

export class InsufficientLeaveBalanceError extends DomainError {
  readonly code = "INSUFFICIENT_BALANCE";
  constructor(employeeId: string, requested: number, available: number) {
    super(
      `Employee "${employeeId}" requested ${requested} day(s) but only has ${available} available.`
    );
  }
}
