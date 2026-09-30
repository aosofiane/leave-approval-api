import { test } from "node:test";
import assert from "node:assert/strict";
import { LeaveRequest } from "../src/domain/entities/LeaveRequest.js";
import { DateRange } from "../src/domain/value-objects/DateRange.js";
import { LeaveStatus, Role, Actor } from "../src/domain/value-objects/LeaveStatus.js";
import { UnauthorizedActionError, InvalidTransitionError } from "../src/domain/errors/DomainErrors.js";

const NOW = new Date("2026-10-01T00:00:00Z");

const employee: Actor = { id: "emp-1", role: Role.EMPLOYEE };
const otherEmployee: Actor = { id: "emp-2", role: Role.EMPLOYEE };
const manager: Actor = { id: "mgr-1", role: Role.MANAGER, managedEmployeeIds: ["emp-1"] };
const wrongManager: Actor = { id: "mgr-2", role: Role.MANAGER, managedEmployeeIds: ["emp-2"] };
const hr: Actor = { id: "hr-1", role: Role.HR };

function shortRequest(): LeaveRequest {
  // Mon–Wed: 3 business days, well under the manager approval limit
  const range = DateRange.create(new Date("2026-10-05"), new Date("2026-10-07"), NOW);
  return LeaveRequest.create("emp-1", range, "Family event");
}

function longRequest(): LeaveRequest {
  // 3 full weeks: comfortably over the manager approval limit
  const range = DateRange.create(new Date("2026-10-05"), new Date("2026-10-23"), NOW);
  return LeaveRequest.create("emp-1", range, "Extended trip");
}

test("happy path: submit then manager approves a short request", () => {
  const req = shortRequest();
  req.submit(employee);
  assert.equal(req.status, LeaveStatus.MANAGER_REVIEW);

  req.approve(manager, "Enjoy!");
  assert.equal(req.status, LeaveStatus.APPROVED);
  assert.equal(req.isTerminal, true);
  assert.equal(req.history.length, 2);
  assert.equal(req.history[1]?.byActorId, "mgr-1");
});

test("employee cannot submit someone else's request", () => {
  const req = shortRequest();
  assert.throws(() => req.submit(otherEmployee), UnauthorizedActionError);
});

test("a manager not assigned to the employee cannot approve", () => {
  const req = shortRequest();
  req.submit(employee);
  assert.throws(() => req.approve(wrongManager), UnauthorizedActionError);
});

test("manager cannot approve a request that exceeds their authority", () => {
  const req = longRequest();
  req.submit(employee);
  assert.throws(() => req.approve(manager), UnauthorizedActionError);
});

test("long request must be escalated, then only HR can approve it", () => {
  const req = longRequest();
  req.submit(employee);
  req.escalate(manager, "Exceeds my approval limit");
  assert.equal(req.status, LeaveStatus.ESCALATED);

  // manager can no longer act on it directly
  assert.throws(() => req.approve(manager), UnauthorizedActionError);

  req.approve(hr, "Approved at HR level");
  assert.equal(req.status, LeaveStatus.APPROVED);
});

test("cannot escalate a request that is within manager authority", () => {
  const req = shortRequest();
  req.submit(employee);
  assert.throws(() => req.escalate(manager), UnauthorizedActionError);
});

test("rejection requires a comment", () => {
  const req = shortRequest();
  req.submit(employee);
  assert.throws(() => req.reject(manager, ""), /must include a comment/);
});

test("employee can cancel while pending, but not after approval", () => {
  const req = shortRequest();
  req.submit(employee);
  req.cancel(employee);
  assert.equal(req.status, LeaveStatus.CANCELLED);

  const approved = shortRequest();
  approved.submit(employee);
  approved.approve(manager);
  assert.throws(() => approved.cancel(employee), InvalidTransitionError);
});

test("cannot submit a request that isn't in DRAFT", () => {
  const req = shortRequest();
  req.submit(employee);
  assert.throws(() => req.submit(employee), InvalidTransitionError);
});
