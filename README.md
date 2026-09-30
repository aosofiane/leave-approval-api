# leave-approval-api

A leave-request approval workflow, built to demonstrate a domain-driven,
test-first approach to a Node.js/TypeScript API — not a CRUD toy.

> **Status**: domain layer complete and tested. Application (use cases),
> HTTP API, persistence, and observability layers are the next milestones
> (see [Roadmap](#roadmap)).

## Why this domain

A leave-request workflow looks simple on the surface but has real business
rules worth modeling explicitly:

- A request moves through a **state machine**, not a free-form status field.
- **Who can act depends on the state**: an employee can submit or cancel
  their own request; their manager can approve/reject/escalate it; but a
  manager only has authority up to a threshold of business days — beyond
  that, only HR can decide.
- Decisions need an **audit trail**: who did what, when, and why.

That's enough surface area to show architecture decisions that a truly
minimal CRUD API wouldn't require — which is the point of this project.

## State machine

```
                submit                    approve
      DRAFT ────────────► MANAGER_REVIEW ────────────► APPROVED
        │                       │    │                     ▲
        │                       │    │ escalate            │
        │ cancel                │    └──────────► ESCALATED┤
        │                       │ reject                │  │
        │                       ▼                       │  │ approve/reject
        │                  REJECTED                      │  │ (HR only)
        └─────────────────────────────────────────────► CANCELLED
```

Rules enforced by [`LeaveTransitionPolicy`](src/domain/services/LeaveTransitionPolicy.ts):

| Action     | Allowed from                     | Who                                          |
|------------|-----------------------------------|-----------------------------------------------|
| `submit`   | `DRAFT`                           | the request's own employee                    |
| `approve`  | `MANAGER_REVIEW` (≤ 10 biz days)  | the employee's assigned manager               |
| `approve`  | `ESCALATED`                       | HR                                             |
| `reject`   | `MANAGER_REVIEW` / `ESCALATED`    | manager / HR respectively (comment required)  |
| `escalate` | `MANAGER_REVIEW` (> 10 biz days)  | the employee's assigned manager               |
| `cancel`   | any non-terminal state            | the request's own employee                    |

## Architecture

```
src/domain/
├── entities/        LeaveRequest — the aggregate root; owns state + history
├── value-objects/    DateRange (validated dates, business-day math),
│                     LeaveStatus / Role / Actor (shared vocabulary)
├── services/         LeaveTransitionPolicy — transition + authorization rules
└── errors/           Typed domain errors (no bare `throw new Error(...)`)
```

**Why the policy is a separate class from the entity.** `LeaveRequest`
owns state and exposes intention-revealing methods (`submit`, `approve`,
`reject`, `escalate`, `cancel`). *Whether* a given actor can currently do
one of those things is a different concern — it changes for different
reasons (e.g., HR adjusts the approval threshold) and is far easier to
unit-test in isolation when it isn't tangled with state mutation.

**Why errors are typed.** The domain doesn't know what an HTTP status
code is. `DomainError` subclasses (e.g. `UnauthorizedActionError`,
`InvalidTransitionError`) carry a `code` the future HTTP layer maps to
a status — one explicit mapping table, instead of string-matching error
messages.

**Why history lives on the entity.** Every successful transition is
appended to `LeaveRequest.history` as part of the same operation that
changes the status — so the entity is its own audit log, not something
reconstructed later from scattered log lines.

## Running it

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node's built-in test runner, via tsx
npm run build       # emits ESM JS to dist/
```

No test framework dependency (Vitest/Jest) was needed for this layer —
Node 20+'s built-in `node:test` + `node:assert` is enough for pure
domain logic, and it's one less thing to configure. Vitest is a
reasonable addition once HTTP integration tests are in scope.

## Roadmap

- [ ] **Application layer**: use cases (`SubmitLeaveRequest`,
      `ApproveLeaveRequest`, ...) orchestrating the domain + a
      `LeaveRequestRepository` port
- [ ] **Persistence**: Postgres adapter implementing the repository port
- [ ] **HTTP layer**: Fastify routes, Zod request validation, OpenAPI spec
- [ ] **Observability**: OpenTelemetry traces across a request's lifecycle
      (submit → review → approve), Grafana dashboard
- [ ] **CI/CD**: GitHub Actions — lint, typecheck, test, build, Trivy/Grype
      vulnerability scan
- [ ] One or two short **ADRs** (Architecture Decision Records) for the
      non-obvious calls above (why a separate policy class, why typed
      domain errors)
