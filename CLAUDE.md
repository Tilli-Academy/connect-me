# CLAUDE.md — Permanent Project Instructions

> These are binding rules for the entire development of the Carpooling Platform. Follow them on every task.
> **`plan.md` is the source of truth. Always read and follow `plan.md`.** If any request conflicts with `plan.md` or these rules, stop and ask before proceeding.

---

## 0. Prime Directives (read every task)
- **Always read and follow `plan.md`.** It defines scope, architecture, schema, workflows, and the phased build.
- **Follow the approved folder structure** (plan.md §5 and §6). Do not invent new top-level structure.
- **Write modular, reusable code.** Small functions, single responsibility, feature-sliced modules.
- **Never hardcode credentials or secrets.** All secrets come from environment variables.
- **Validate every API request** with Fastify JSON Schema.
- **Follow proper authentication and authorization** on every protected and mutating endpoint.
- **Write tests for important business logic** (seat accounting, ownership, booking rules).
- **Avoid unnecessary dependencies.** Prefer the standard stack already approved.
- **Do not modify unrelated files.** Keep each change scoped to its task.
- **Before any major architectural change, ask for approval.**
- **After completing each task, explain which files changed and report testing results.**
- **Do not implement application features unless the current task explicitly asks for it.**

---

## 1. Project Overview
A production-quality carpooling web app where any authenticated user can **publish rides** (as a driver) and **book seats** (as a passenger). Roles are per-action, not per-account. Core flows: auth, profile, ride publishing, ride search, seat booking with driver accept/reject, cancellation, and user dashboards. Seat availability must always stay correct — including under concurrent accepts. MVP excludes ratings, notifications, payments, maps, and an admin role (see plan.md §1).

---

## 2. Approved Technology Stack
- **Frontend:** React.js, Vite, Tailwind CSS, React Router.
- **Backend:** Node.js, Fastify.
- **ORM:** Prisma.
- **Database:** PostgreSQL.
- **Auth:** JWT (Bearer) + bcrypt.
- **Validation:** Fastify JSON Schema.
- **Tooling:** Git, GitHub.

Do not introduce other frameworks, ORMs, state libraries, or UI kits without approval.

---

## 3. Architecture Rules
- **3-tier, stateless API.** No server-side sessions; identity travels in the JWT.
- **Backend request flow is fixed:** `route (validated) → authenticate → authorize → service → prisma`.
- **Routes** declare the HTTP contract and validation only — no business logic.
- **Services** own all business rules and all multi-step writes.
- **All seat-changing writes run inside `prisma.$transaction` with row locking.** Never adjust seats outside a transaction.
- **`Ride.availableSeats` is the authoritative, denormalized seat count.** Do not derive availability ad hoc elsewhere.
- **Cross-cutting concerns are Fastify plugins:** `prisma`, `auth`, `rateLimit`, `errorHandler`.
- Do not bypass the service layer by putting Prisma calls directly in routes.

---

## 4. Coding Standards
- Match the style of surrounding code; keep it consistent across the repo.
- Clear, intention-revealing names; no abbreviations that obscure meaning.
- Small, single-purpose functions and modules; extract reusable helpers into `lib/`.
- Comment the *why* for non-obvious logic (e.g., locking rationale); avoid noise comments.
- No dead code, no commented-out blocks left behind.
- Handle errors explicitly; never swallow them silently.
- Keep configuration in `config/` / env, not scattered as literals.

---

## 5. React Frontend Conventions
- Follow the frontend structure in plan.md §5: `api/`, `context/`, `hooks/`, `components/`, `pages/`, `routes/`.
- Functional components with hooks only.
- **All HTTP goes through the `api/` client layer** — components never call `fetch`/`axios` directly.
- Auth state lives in `AuthContext`; consume it via `useAuth`.
- Guard authenticated pages with `ProtectedRoute`.
- **Styling is Tailwind utility classes only** — no inline style objects for layout, no separate CSS modules unless justified.
- Keep components presentational where possible; put data logic in hooks.
- Never store JWT secrets in the frontend; the token is handled per the auth design only.

---

## 6. Fastify Backend Conventions
- Feature-sliced modules under `src/modules/<feature>/` with `*.routes.js`, `*.service.js`, `*.schema.js`.
- Register cross-cutting behavior as plugins; decorate the instance (e.g., `fastify.prisma`).
- Every route defines a `schema` (body/params/query/response) for validation.
- Business logic lives in services; routes stay thin.
- Use `async/await`; let the centralized error handler translate thrown typed errors to HTTP responses.
- Keep `app.js` (build/configure) separate from `server.js` (listen).

---

## 7. PostgreSQL / Database Conventions
- The schema is defined in `prisma/schema.prisma` exactly as specified in plan.md §7. Changes require a migration and approval if structural.
- **All schema changes go through Prisma migrations** — never hand-edit the database.
- UUID primary keys; `createdAt`/`updatedAt` on all models.
- Preserve the defined indexes (search path `(origin, destination, departureAt)`, plus FK/status indexes).
- Named relations (`DriverRides`, `PassengerBookings`) must be kept — `User` reaches rides and bookings on two paths.
- Enforce seat correctness in services via transactions and row locking; never let `availableSeats` go negative.
- Use Prisma for all access — no raw string-concatenated SQL.

---

## 8. API Development Standards
- Base path `/api`; resource routes as specified in plan.md §8.
- JSON request/response bodies.
- **Validate all inputs** (body, params, query) with JSON Schema; reject invalid input with `400`.
- Consistent error shape: `{ error: { code, message } }`.
- Standard status codes: `200/201` success, `400` validation, `401` unauthenticated, `403` forbidden/ownership, `404` not found, `409` conflict (e.g., no seats).
- Never return sensitive fields (e.g., `passwordHash`); withhold email/phone from public listings until a booking relationship exists.
- Keep endpoints RESTful and consistent with the documented contract; update plan.md §8 if the contract changes (with approval).

---

## 9. Authentication & Authorization Rules
- Passwords hashed with **bcrypt**; never stored or logged in plaintext.
- JWT signed with a secret from env (`JWT_SECRET`); short-lived access token; secret never committed.
- The `authenticate` preHandler verifies the token and attaches `request.user`.
- **Authorization is mandatory on every mutation and user-scoped read:**
  - Only the ride owner may accept/reject requests or edit/cancel a ride.
  - Only the booking owner (passenger) may cancel their booking.
  - A driver cannot book their own ride.
- Ownership failures return `403`. Never trust client-supplied user IDs — derive identity from the JWT.

---

## 10. Error-Handling Standards
- Use typed application errors from `lib/errors.js`; throw them from services.
- A **centralized Fastify error handler** maps errors to the standard HTTP response shape.
- No leaking stack traces or internal details to clients.
- Validation errors → `400`; auth → `401`; ownership → `403`; missing → `404`; seat/state conflicts → `409`.
- Log server-side errors with enough context to debug; never log secrets or passwords.
- Fail transactions atomically — on any error inside a seat operation, roll back entirely.

---

## 11. Security Requirements
- **Never hardcode credentials or secrets** — environment variables only; `.env` gitignored, `.env.example` committed.
- bcrypt password hashing; strong JWT secret; HTTPS in production.
- Validate and sanitize all inputs; rely on Prisma's parameterization (no raw SQL injection vectors).
- **Rate limit** auth and booking endpoints.
- **CORS** restricted to the frontend origin.
- Enforce authorization everywhere to prevent IDOR.
- Do not expose sensitive user data in public responses.
- Transactional seat accounting to prevent overselling (integrity + correctness).

---

## 12. Testing Requirements
- **Write tests for important business logic**, including:
  - Seat decrement on accept and restore on cancel; `availableSeats` never negative.
  - **Concurrency: parallel accepts on the last seat — exactly one succeeds.**
  - Ownership checks, past-date rejection, self-booking rejection, one-active-booking rule.
- Integration tests per endpoint (auth, validation, error paths) against an isolated test DB.
- E2E happy path: register → publish → search → request → accept → cancel.
- **After each task, report what was tested and the results.** If something is untested or failing, say so explicitly.

---

## 13. Git Conventions
- Work on feature branches; never commit directly to the default branch.
- **Commit or push only when I ask.**
- Small, focused commits with clear, imperative messages (e.g., `add booking accept transaction`).
- Reference the relevant plan.md phase/section where helpful.
- Do not commit secrets, `.env`, build artifacts, or `node_modules` (keep `.gitignore` current).
- Keep PRs scoped to a single task/phase.

---

## 14. Environment Variable Rules
- All secrets and environment-specific config come from env vars.
- Required backend vars: `DATABASE_URL`, `JWT_SECRET` (plus any port/CORS origin config).
- Required frontend var: `VITE_API_URL`.
- Maintain `.env.example` with every variable name (no real values).
- Load/validate env in `config/env.js`; fail fast if a required var is missing.
- Never print secret values in logs or responses.

---

## Working Agreement (per task)
1. Read `plan.md` and confirm the task fits the current phase and approved architecture.
2. Implement within the approved folder structure, scoped to the task only.
3. Validate inputs, enforce auth/authorization, handle errors per these standards.
4. Add/update tests for important business logic.
5. **Report:** list the files changed and explain each, and state testing results.
6. For anything that would change the approved architecture or schema structurally — **ask first.**
