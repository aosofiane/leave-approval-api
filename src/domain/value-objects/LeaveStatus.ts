export enum LeaveStatus {
  DRAFT = "DRAFT",
  MANAGER_REVIEW = "MANAGER_REVIEW",
  ESCALATED = "ESCALATED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

export const TERMINAL_STATUSES: ReadonlySet<LeaveStatus> = new Set([
  LeaveStatus.APPROVED,
  LeaveStatus.REJECTED,
  LeaveStatus.CANCELLED,
]);

export enum Role {
  EMPLOYEE = "EMPLOYEE",
  MANAGER = "MANAGER",
  HR = "HR",
}

/**
 * The acting user for a given command. Deliberately a plain data shape,
 * not a full User entity — the domain only needs to know *who is asking*
 * and *what they're allowed to see*, not the rest of a user profile.
 */
export interface Actor {
  id: string;
  role: Role;
  /** For managers: the employee ids they are allowed to review. Ignored for other roles. */
  managedEmployeeIds?: readonly string[];
}

export interface TransitionRecord {
  from: LeaveStatus;
  to: LeaveStatus;
  byActorId: string;
  byRole: Role;
  at: Date;
  comment: string | undefined;
}
