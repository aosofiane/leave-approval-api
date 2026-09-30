import { Actor, LeaveStatus, Role } from "../value-objects/LeaveStatus.js";
import { InvalidTransitionError, UnauthorizedActionError } from "../errors/DomainErrors.js";

/**
 * Beyond this many business days, a manager cannot approve/reject alone —
 * the request must go to HR. This is the one "magic number" in the
 * domain, so it lives here, named, instead of buried in an if-statement.
 */
export const MANAGER_APPROVAL_LIMIT_BUSINESS_DAYS = 10;

export type LeaveCommand = "SUBMIT" | "APPROVE" | "REJECT" | "ESCALATE" | "CANCEL";

interface PolicyContext {
  requestOwnerId: string;
  businessDays: number;
}

/**
 * Encodes "who can do what, from which state" as data + guard functions,
 * separately from the LeaveRequest entity itself.
 *
 * Why split this out of the entity: the entity's job is to hold state
 * and expose intention-revealing methods (submit, approve, ...). The
 * *rules* for whether a given transition is currently legal are a
 * separate concern that changes for different reasons (e.g. HR wants
 * a different threshold) and is much easier to unit-test in isolation
 * when it isn't tangled with mutation logic.
 */
export class LeaveTransitionPolicy {
  private static readonly ALLOWED_SOURCE_STATES: Record<LeaveCommand, readonly LeaveStatus[]> = {
    SUBMIT: [LeaveStatus.DRAFT],
    APPROVE: [LeaveStatus.MANAGER_REVIEW, LeaveStatus.ESCALATED],
    REJECT: [LeaveStatus.MANAGER_REVIEW, LeaveStatus.ESCALATED],
    ESCALATE: [LeaveStatus.MANAGER_REVIEW],
    CANCEL: [LeaveStatus.DRAFT, LeaveStatus.MANAGER_REVIEW, LeaveStatus.ESCALATED],
  };

  /**
   * Throws if `command` cannot be applied by `actor` to a request currently
   * in `currentStatus`. Returns the resulting status when it succeeds.
   */
  static authorize(
    command: LeaveCommand,
    currentStatus: LeaveStatus,
    actor: Actor,
    context: PolicyContext
  ): LeaveStatus {
    const allowedSources = this.ALLOWED_SOURCE_STATES[command];
    if (!allowedSources.includes(currentStatus)) {
      throw new InvalidTransitionError(currentStatus, `<${command}>`);
    }

    switch (command) {
      case "SUBMIT":
        this.assertOwner(actor, context, "submit");
        return LeaveStatus.MANAGER_REVIEW;

      case "CANCEL":
        this.assertOwner(actor, context, "cancel");
        return LeaveStatus.CANCELLED;

      case "ESCALATE":
        this.assertManagerOf(actor, context, "escalate");
        if (context.businessDays <= MANAGER_APPROVAL_LIMIT_BUSINESS_DAYS) {
          throw new UnauthorizedActionError(
            "escalate",
            `request spans ${context.businessDays} business day(s), within manager authority ` +
              `(${MANAGER_APPROVAL_LIMIT_BUSINESS_DAYS}); escalation is not needed.`
          );
        }
        return LeaveStatus.ESCALATED;

      case "APPROVE":
      case "REJECT": {
        if (currentStatus === LeaveStatus.ESCALATED) {
          this.assertRole(actor, Role.HR, command);
        } else {
          this.assertManagerOf(actor, context, command.toLowerCase());
          if (context.businessDays > MANAGER_APPROVAL_LIMIT_BUSINESS_DAYS) {
            throw new UnauthorizedActionError(
              command.toLowerCase(),
              `request spans ${context.businessDays} business day(s), which exceeds manager ` +
                `authority (${MANAGER_APPROVAL_LIMIT_BUSINESS_DAYS}); it must be escalated to HR first.`
            );
          }
        }
        return command === "APPROVE" ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
      }
    }
  }

  private static assertOwner(actor: Actor, context: PolicyContext, action: string): void {
    if (actor.role !== Role.EMPLOYEE || actor.id !== context.requestOwnerId) {
      throw new UnauthorizedActionError(action, "only the requesting employee may do this.");
    }
  }

  private static assertManagerOf(actor: Actor, context: PolicyContext, action: string): void {
    if (
      actor.role !== Role.MANAGER ||
      !(actor.managedEmployeeIds ?? []).includes(context.requestOwnerId)
    ) {
      throw new UnauthorizedActionError(
        action,
        "only the requesting employee's manager may do this."
      );
    }
  }

  private static assertRole(actor: Actor, role: Role, action: string): void {
    if (actor.role !== role) {
      throw new UnauthorizedActionError(action, `only ${role} may do this.`);
    }
  }
}
