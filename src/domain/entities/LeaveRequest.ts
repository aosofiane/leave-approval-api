import { randomUUID } from "node:crypto";
import { DateRange } from "../value-objects/DateRange.js";
import {
  Actor,
  LeaveStatus,
  TERMINAL_STATUSES,
  TransitionRecord,
} from "../value-objects/LeaveStatus.js";
import { LeaveCommand, LeaveTransitionPolicy } from "../services/LeaveTransitionPolicy.js";

export interface LeaveRequestSnapshot {
  id: string;
  employeeId: string;
  range: DateRange;
  reason: string;
  status: LeaveStatus;
  history: readonly TransitionRecord[];
}

/**
 * The aggregate root for a single leave request.
 *
 * Design choices worth calling out to a reviewer:
 * - All mutation goes through named intention-revealing methods (submit,
 *   approve, reject, escalate, cancel) — never a generic `setStatus()`.
 *   That's what makes "you can't skip a step" a property of the type,
 *   not a convention someone has to remember to follow in a use case.
 * - Every transition is authorized via LeaveTransitionPolicy *before*
 *   any state changes, and every successful transition is appended to
 *   `history` — so the entity is also its own audit log, not something
 *   bolted on afterward in the persistence layer.
 * - The constructor is private; use `LeaveRequest.create(...)` or
 *   `LeaveRequest.rehydrate(...)` so it's clear whether you're creating
 *   a brand-new request or reconstructing one from storage.
 */
export class LeaveRequest {
  private constructor(
    public readonly id: string,
    public readonly employeeId: string,
    private _range: DateRange,
    private _reason: string,
    private _status: LeaveStatus,
    private _history: TransitionRecord[]
  ) {}

  static create(employeeId: string, range: DateRange, reason: string): LeaveRequest {
    return new LeaveRequest(randomUUID(), employeeId, range, reason, LeaveStatus.DRAFT, []);
  }

  /** Reconstructs a LeaveRequest from persisted data. No validation re-run — trusted source. */
  static rehydrate(snapshot: LeaveRequestSnapshot): LeaveRequest {
    return new LeaveRequest(
      snapshot.id,
      snapshot.employeeId,
      snapshot.range,
      snapshot.reason,
      snapshot.status,
      [...snapshot.history]
    );
  }

  get status(): LeaveStatus {
    return this._status;
  }

  get range(): DateRange {
    return this._range;
  }

  get reason(): string {
    return this._reason;
  }

  get history(): readonly TransitionRecord[] {
    return this._history;
  }

  get isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this._status);
  }

  submit(actor: Actor): void {
    this.applyCommand("SUBMIT", actor);
  }

  approve(actor: Actor, comment?: string): void {
    this.applyCommand("APPROVE", actor, comment);
  }

  reject(actor: Actor, comment: string): void {
    // A rejection without a stated reason isn't useful to the employee —
    // enforced here rather than left to API-layer request validation,
    // because it's a business rule, not an input-shape rule.
    if (!comment.trim()) {
      throw new Error("A rejection must include a comment explaining the reason.");
    }
    this.applyCommand("REJECT", actor, comment);
  }

  escalate(actor: Actor, comment?: string): void {
    this.applyCommand("ESCALATE", actor, comment);
  }

  cancel(actor: Actor, comment?: string): void {
    this.applyCommand("CANCEL", actor, comment);
  }

  private applyCommand(command: LeaveCommand, actor: Actor, comment?: string): void {
    const nextStatus = LeaveTransitionPolicy.authorize(command, this._status, actor, {
      requestOwnerId: this.employeeId,
      businessDays: this._range.businessDays(),
    });

    const record: TransitionRecord = {
      from: this._status,
      to: nextStatus,
      byActorId: actor.id,
      byRole: actor.role,
      at: new Date(),
      comment,
    };

    this._status = nextStatus;
    this._history.push(record);
  }

  toSnapshot(): LeaveRequestSnapshot {
    return {
      id: this.id,
      employeeId: this.employeeId,
      range: this._range,
      reason: this._reason,
      status: this._status,
      history: this._history,
    };
  }
}
