# Carpooling Platform — Project Plan

> A production-quality web application where users share rides with others travelling to the same destination.
> This document is the single source of truth for scope, architecture, and the phased build. It contains **no application code** — only structure, specifications, and the data model.

---

## 1. Project Overview & Objectives

### Overview
A carpooling platform where any authenticated user can **offer rides** (acting as a driver) and **book seats on rides** (acting as a passenger). Roles are per-action, not per-account — the same person can publish a ride today and book one tomorrow.

### Objectives
- Let drivers publish rides with origin, destination, date/time, seats, and price.
- Let passengers search rides by pickup, destination, and travel date, and request seats.
- Give drivers control to accept or reject booking requests.
- Keep **seat availability correct under concurrency** — the system's highest-risk invariant.
- Let users manage their own rides and bookings and cancel according to simple rules.
- Ship a secure, maintainable MVP with a clean path to future features.

### Explicitly out of scope (MVP)
Ratings/reviews, notifications/email, payments, maps/geocoding. These are deferred, not designed away.

> **Post-MVP addition — Admin Module.** An **Admin Module** (admin authentication, role-based authorization, platform statistics, and user/ride moderation) is being added **after** the MVP. It was originally out of scope; it is now specified in §15 and built in **Phase 10**. The core user-facing MVP (Phases 0–9) is complete and remains unchanged.

---

## 2. Requirements

### 2.1 Functional Requirements
- **Auth:** registration (email + password), login, logout, password change.
- **Profile:** view and edit profile (name, phone, bio, avatar URL).
- **Ride publishing (driver):** create, edit, and cancel a ride; view own rides and their incoming requests.
- **Ride search (passenger):** search by pickup, destination, and travel date; see available rides with remaining seats, price, departure time, and driver name.
- **Booking:** request N seats; driver accepts/rejects; passenger views bookings and statuses; passenger cancels before departure.
- **Seat availability:** decrements only when a booking is **accepted**; restores when an accepted booking is cancelled.
- **Dashboards:** "My Rides" (as driver) and "My Bookings" (as passenger).
- **Admin (post-MVP, Phase 10):** admin login with role-based access; dashboard statistics (user/ride/booking counts and status breakdowns); view all users and rides; deactivate/reactivate users and rides for moderation.

### 2.2 Non-Functional Requirements
- **Concurrency correctness:** seat counts never oversell under simultaneous accepts (transaction + row lock).
- **Security:** hashed passwords, JWT auth, authorization on every mutation, input validation, rate limiting.
- **Performance:** indexed search path; read-heavy workload friendly.
- **Consistency/reliability:** bookings and seat counts never diverge.
- **Scalability:** stateless API (JWT) → horizontal scaling.
- **Maintainability:** feature-sliced modules, clear route→service→data layering.
- **Usability:** responsive Tailwind UI with clear booking states.
- **Auditability:** `createdAt` / `updatedAt` timestamps on all records.

---

## 3. Technology Stack

| Layer | Choice |
|---|---|
| Frontend | React.js, Vite, Tailwind CSS, React Router |
| Backend | Node.js, Fastify |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT (Bearer), bcrypt for password hashing |
| Validation | Fastify JSON Schema (route-level in/out validation) |
| Tooling | Git, GitHub, Claude Code |

**Confirmed design defaults:** UUID primary keys; denormalized `availableSeats` as the authoritative count; free-text `origin`/`destination` with case-insensitive matching for MVP search.

---

## 4. System Architecture

Classic 3-tier, stateless API.

```
┌─────────────────┐     HTTPS/JSON      ┌──────────────────────┐     Prisma      ┌────────────┐
│  React + Vite   │ ──────────────────► │   Fastify API        │ ──────────────► │ PostgreSQL │
│  Tailwind SPA   │ ◄────────────────── │   (stateless, JWT)   │ ◄────────────── │            │
└─────────────────┘   Bearer JWT        └──────────────────────┘                 └────────────┘
```

**Per-request flow (backend):**
```
HTTP route (JSON-Schema validated)
  → preHandler: authenticate (verify JWT)  → authorize (ownership checks)
     → service (business rules + prisma.$transaction)
        → prisma (data access)
```

- **Routes** declare the HTTP contract and validation.
- **Services** own business rules; all multi-step writes run inside `prisma.$transaction`. Seat decrement + row locking lives here.
- **Plugins** (Fastify DI): `prisma`, `auth` (jwt + authenticate), centralized error handler, rate limiter.
- **Stateless**: no server session; the JWT carries identity, enabling horizontal scale.

---

## 5. Frontend Folder Structure

```
frontend/
├── src/
│   ├── main.jsx                 # app entry
│   ├── App.jsx                  # router root
│   ├── index.css                # @tailwind base/components/utilities
│   ├── api/                     # http client + per-resource calls
│   │   ├── client.js            # axios/fetch instance, attaches Bearer token
│   │   ├── auth.api.js
│   │   ├── rides.api.js
│   │   ├── bookings.api.js
│   │   └── admin.api.js        # Phase 10: admin stats, users, rides
│   ├── context/
│   │   └── AuthContext.jsx      # token + current user state
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useRides.js
│   │   └── useBookings.js
│   ├── components/              # reusable UI
│   │   ├── RideCard.jsx
│   │   ├── BookingBadge.jsx
│   │   ├── SeatSelector.jsx
│   │   ├── Navbar.jsx
│   │   └── FormField.jsx
│   ├── pages/
│   │   ├── Register.jsx
│   │   ├── Login.jsx
│   │   ├── Profile.jsx
│   │   ├── SearchRides.jsx
│   │   ├── PublishRide.jsx
│   │   ├── RideDetails.jsx
│   │   ├── MyRides.jsx          # driver dashboard + incoming requests
│   │   ├── MyBookings.jsx       # passenger dashboard
│   │   └── admin/               # Phase 10: admin-only pages
│   │       ├── AdminDashboard.jsx   # platform statistics
│   │       ├── AdminUsers.jsx       # view + deactivate/reactivate users
│   │       └── AdminRides.jsx       # view + deactivate/reactivate rides
│   └── routes/
│       ├── ProtectedRoute.jsx   # guards authenticated pages
│       └── AdminRoute.jsx       # Phase 10: guards admin-only pages (role = ADMIN)
├── index.html
├── tailwind.config.js           # content globs for src
├── postcss.config.js            # tailwindcss + autoprefixer
├── vite.config.js
├── .env                         # VITE_API_URL
└── package.json
```

**Tailwind config:** `tailwind.config.js` with `content: ['./index.html', './src/**/*.{js,jsx}']`; `postcss.config.js` loading `tailwindcss` + `autoprefixer`; `@tailwind` directives in `index.css`.

---

## 6. Backend Folder Structure

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app.js                   # build & configure Fastify instance
│   ├── server.js                # start listener
│   ├── config/
│   │   └── env.js               # load & validate env vars
│   ├── plugins/
│   │   ├── prisma.js            # decorate fastify with db client
│   │   ├── auth.js              # jwt register + authenticate + authorizeAdmin preHandlers
│   │   ├── rateLimit.js
│   │   └── errorHandler.js      # centralized error → HTTP mapping
│   ├── modules/                 # feature-sliced (routes + service + schema)
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.schema.js
│   │   ├── users/
│   │   │   ├── users.routes.js
│   │   │   ├── users.service.js
│   │   │   └── users.schema.js
│   │   ├── rides/
│   │   │   ├── rides.routes.js
│   │   │   ├── rides.service.js
│   │   │   └── rides.schema.js
│   │   ├── bookings/
│   │   │   ├── bookings.routes.js
│   │   │   ├── bookings.service.js
│   │   │   └── bookings.schema.js
│   │   └── admin/                   # Phase 10: admin-only module
│   │       ├── admin.routes.js
│   │       ├── admin.service.js
│   │       └── admin.schema.js
│   └── lib/
│       ├── hash.js              # bcrypt helpers
│       └── errors.js            # typed app errors
├── .env                         # DATABASE_URL, JWT_SECRET  (gitignored)
├── .env.example
└── package.json
```

---

## 7. Database Schema & Relationships

Three entities: `User`, `Ride`, `Booking`. Roles are relationships, not columns.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  name         String
  phone        String?
  bio          String?
  avatarUrl    String?
  role         Role      @default(USER)    // Phase 10: USER (default) or ADMIN
  isActive     Boolean   @default(true)     // Phase 10: admins can deactivate; false blocks auth
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  ridesOffered Ride[]    @relation("DriverRides")
  bookings     Booking[] @relation("PassengerBookings")
}

model Ride {
  id             String     @id @default(uuid())
  driverId       String
  driver         User       @relation("DriverRides", fields: [driverId], references: [id])

  origin         String
  destination    String
  departureAt    DateTime
  totalSeats     Int
  availableSeats Int                       // denormalized; authoritative availability count
  pricePerSeat   Decimal    @db.Decimal(10, 2)
  notes          String?
  status         RideStatus @default(ACTIVE)

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  bookings       Booking[]

  @@index([origin, destination, departureAt])   // search path
  @@index([driverId])
}

model Booking {
  id          String        @id @default(uuid())
  rideId      String
  ride        Ride          @relation(fields: [rideId], references: [id])
  passengerId String
  passenger   User          @relation("PassengerBookings", fields: [passengerId], references: [id])

  seatsBooked Int           @default(1)
  status      BookingStatus @default(PENDING)

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([passengerId])
  @@index([rideId, status])
}

enum RideStatus {
  ACTIVE
  CANCELLED
  COMPLETED
  SUSPENDED   // Phase 10: admin-deactivated; excluded from search like any non-ACTIVE status
}

enum BookingStatus {
  PENDING
  ACCEPTED
  REJECTED
  CANCELLED
}

enum Role {       // Phase 10
  USER
  ADMIN
}
```

### Relationships
- `User 1 — ∞ Ride` as **driver** (named relation `DriverRides`).
- `User 1 — ∞ Booking` as **passenger** (named relation `PassengerBookings`).
- `Ride 1 — ∞ Booking`.

Named relations are required because `User` reaches rides and bookings on two distinct paths.

### Seat-availability model
`Ride.availableSeats` is denormalized and authoritative. Correctness is enforced in the service layer:
- **Accept** (in `prisma.$transaction`): lock ride row, re-check `availableSeats >= seatsBooked`, set booking `ACCEPTED`, decrement `availableSeats`.
- **Cancel accepted booking** (before `departureAt`): set `CANCELLED`, increment `availableSeats`.
- **Request / reject / cancel-pending:** no seat movement.
- **Driver cancels ride:** ride → `CANCELLED`, cascade `PENDING`/`ACCEPTED` bookings → `CANCELLED`, all in one transaction.

### Business rules (service layer)
- Driver cannot book their own ride (`driverId !== passengerId`).
- No booking/publishing with `departureAt` in the past.
- One active booking per `(rideId, passengerId)`; rebooking allowed after cancel.
- Cancellation allowed anytime while `now < departureAt` (simple comparison, no cutoff window).

### Admin model additions (Phase 10)
- `User.role` (`USER` | `ADMIN`) drives role-based authorization; defaults to `USER`. There is no self-service promotion — the first admin is provisioned via seed/DB (see §15).
- `User.isActive` — admins deactivate accounts; a deactivated user fails authentication (login rejected and existing tokens rejected at `authenticate`).
- `RideStatus.SUSPENDED` — admins deactivate rides for moderation. Because search already filters `status = ACTIVE`, suspended rides drop out of results automatically; an admin `SUSPENDED` stays distinct from a driver's `CANCELLED`.
- All three are **additive, backward-compatible** changes (defaulted columns + a new enum value) applied via a new Prisma migration. Existing rows default to `USER` / `isActive = true`; **no seat-accounting logic changes**.

---

## 8. REST API Endpoint Specifications

Base path: `/api`. All mutating and user-scoped endpoints require `Authorization: Bearer <token>`.

### Auth — `/api/auth`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/register` | – | Create account; returns token + user |
| POST | `/login` | – | Verify credentials; returns token + user |
| POST | `/change-password` | ✓ | Change own password |
| GET  | `/me` | ✓ | Current authenticated user |

### Users — `/api/users`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/me` | ✓ | Get own profile |
| PATCH| `/me` | ✓ | Update own profile |

### Rides — `/api/rides`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | ✓ | Publish a ride (caller = driver) |
| GET  | `/` | – | Search: `?origin=&destination=&date=` |
| GET  | `/:id` | – | Ride details |
| PATCH| `/:id` | ✓ (owner) | Edit ride (guarded if accepted bookings exist) |
| DELETE | `/:id` | ✓ (owner) | Cancel ride (cascades bookings) |
| GET  | `/mine/offered` | ✓ | Driver's own rides |
| GET  | `/:id/bookings` | ✓ (owner) | Incoming requests for a ride |

### Bookings — `/api/bookings`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | ✓ | Request seats on a ride `{ rideId, seatsBooked }` |
| GET  | `/mine` | ✓ | Passenger's own bookings |
| PATCH| `/:id/accept` | ✓ (ride owner) | Accept → decrement seats (transaction) |
| PATCH| `/:id/reject` | ✓ (ride owner) | Reject request |
| PATCH| `/:id/cancel` | ✓ (passenger) | Cancel own booking before departure |

### Admin — `/api/admin`  *(Phase 10; every route requires `Authorization: Bearer <token>` with role `ADMIN`)*
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/stats` | ✓ (admin) | Dashboard statistics: totals for users, rides, bookings with status breakdowns |
| GET  | `/users` | ✓ (admin) | List users (paginated; never returns `passwordHash`) |
| GET  | `/users/:id` | ✓ (admin) | View a single user |
| PATCH| `/users/:id/deactivate` | ✓ (admin) | Deactivate a user (`isActive = false`) |
| PATCH| `/users/:id/activate` | ✓ (admin) | Reactivate a user (`isActive = true`) |
| GET  | `/rides` | ✓ (admin) | List all rides, any status (paginated) |
| GET  | `/rides/:id` | ✓ (admin) | View a single ride |
| PATCH| `/rides/:id/deactivate` | ✓ (admin) | Deactivate a ride (`status = SUSPENDED`) |
| PATCH| `/rides/:id/activate` | ✓ (admin) | Reactivate a ride (`status = ACTIVE`) |

Admin authentication reuses `POST /api/auth/login`; the issued JWT carries the user's `role`, and admin routes are guarded by an `authorizeAdmin` preHandler (`403` for non-admins, `401` for unauthenticated). Admins are not self-promotable through the API.

**Conventions:** JSON bodies; validation via Fastify JSON Schema; errors as `{ error: { code, message } }`; standard status codes (`400` validation, `401` unauth, `403` forbidden/ownership, `404` not found, `409` conflict e.g. no seats).

---

## 9. Authentication Workflow

1. **Register:** validate input → check email uniqueness → `bcrypt.hash(password)` → create `User` → sign JWT → return `{ token, user }` (no `passwordHash`).
2. **Login:** look up by email → `bcrypt.compare` → on success sign JWT → return `{ token, user }`.
3. **Authenticated request:** client sends `Authorization: Bearer <token>` → `authenticate` preHandler verifies signature/expiry → attaches `request.user = { id, email }`.
4. **Authorization:** services verify ownership (e.g., only ride owner accepts/rejects; only booking owner cancels) → `403` otherwise.
5. **Role-based authorization (Phase 10):** the JWT payload carries `role`. Admin-only routes run an `authorizeAdmin` preHandler after `authenticate`; a non-admin caller is rejected with `403`. Deactivated users (`isActive = false`) fail `authenticate` outright.
6. **Logout:** client discards token (stateless). (Refresh-token rotation noted as future hardening.)

---

## 10. Ride Creation & Search Workflows

### Ride creation (driver)
1. Authenticated user submits origin, destination, `departureAt`, `totalSeats`, `pricePerSeat`, optional notes.
2. Validate: `departureAt` in the future; `totalSeats >= 1`; `pricePerSeat >= 0`.
3. Create ride with `availableSeats = totalSeats`, `status = ACTIVE`.
4. Ride becomes searchable immediately.

### Ride search (passenger)
1. User submits pickup, destination, travel date.
2. Query filters: `status = ACTIVE`, `availableSeats > 0`, `departureAt` within the selected day, case-insensitive origin/destination match — served by the `(origin, destination, departureAt)` index.
3. Return matching rides with remaining seats, price, departure time, driver name.
4. Driver's own rides are excluded from their bookable results.

---

## 11. Booking Workflow

1. **Request:** passenger requests `seatsBooked` on a ride. Validate: ride `ACTIVE`, `departureAt` in future, not own ride, no existing active booking by this passenger, `seatsBooked <= availableSeats`. Create booking `PENDING`. **No seat change.**
2. **Driver reviews** incoming requests for the ride.
3. **Accept (transaction):** lock ride row → re-check `availableSeats >= seatsBooked` → booking → `ACCEPTED` → decrement `availableSeats`. If seats insufficient, reject with `409`.
4. **Reject:** booking → `REJECTED`. No seat change.
5. **Passenger cancel:** allowed while `now < departureAt`. If booking was `ACCEPTED`, increment `availableSeats` back; set `CANCELLED`.
6. **Driver cancels ride:** ride → `CANCELLED`; cascade all `PENDING`/`ACCEPTED` bookings → `CANCELLED` (one transaction).

**Status lifecycle:** `PENDING → ACCEPTED → (CANCELLED | COMPLETED)` or `PENDING → REJECTED`.

---

## 12. Development Phases (Execution Order)

Each phase is small, independently verifiable, and ends in a working increment.

### Phase 0 — Project Scaffolding
- **Objectives:** initialize repos, tooling, and config without features.
- **Deliverables:** backend Fastify app boots; frontend Vite + Tailwind renders a blank styled page; `.env.example` files; Git initialized; Prisma installed and connected to Postgres.

### Phase 1 — Database Foundation
- **Objectives:** model the data.
- **Deliverables:** `schema.prisma` (Section 7) committed; first migration applied; Prisma client generated; DB reachable.

### Phase 2 — Authentication
- **Objectives:** register, login, protected-route plumbing.
- **Deliverables:** auth module (register/login/me/change-password); bcrypt hashing; JWT signing + `authenticate` preHandler; frontend AuthContext, Login/Register pages, ProtectedRoute.

### Phase 3 — User Profile
- **Objectives:** view/edit own profile.
- **Deliverables:** users module (`GET/PATCH /users/me`); frontend Profile page wired to AuthContext.

### Phase 4 — Ride Publishing & Management
- **Objectives:** drivers create/edit/cancel rides.
- **Deliverables:** rides module (create, edit, cancel, mine/offered); validation rules from Section 10; frontend PublishRide + MyRides pages.

### Phase 5 — Ride Search
- **Objectives:** passengers find rides.
- **Deliverables:** `GET /rides` search with filters/index; RideDetails endpoint; frontend SearchRides + RideDetails pages.

### Phase 6 — Booking Core
- **Objectives:** request/accept/reject with correct seat accounting.
- **Deliverables:** bookings module with transactional accept (row lock + re-check + decrement); request/reject; incoming-requests view for drivers; frontend booking request UI + driver accept/reject UI.

### Phase 7 — Cancellation & Dashboards
- **Objectives:** cancellation rules + user-facing history.
- **Deliverables:** passenger cancel (seat restore), driver ride-cancel cascade; MyBookings and MyRides dashboards complete with statuses.

### Phase 8 — Hardening
- **Objectives:** security, validation, polish.
- **Deliverables:** rate limiting on auth/booking; centralized error handler; full JSON-Schema coverage; CORS locked to frontend origin; edge-case handling (Section referenced in 14); responsive UI pass.

### Phase 9 — Testing & Documentation
- **Objectives:** confidence and handoff.
- **Deliverables:** test suite (Section 13); README with setup/run instructions; seed/demo data.

> **Phases 0–10 are complete** — the MVP (Phases 0–9) and the Admin Module (Phase 10) are implemented, tested, and documented.

### Phase 10 — Admin Module (Post-MVP) — ✅ Complete
- **Objectives:** platform oversight and moderation without touching MVP user flows.
- **Scope:** admin authentication + role-based authorization; dashboard statistics (users, rides, bookings); view users and rides; deactivate/reactivate users and rides.
- **Deliverables:**
  - **Schema:** `User.role`, `User.isActive`, `RideStatus.SUSPENDED` — additive migration (§7).
  - **Backend:** `admin/` module (routes + service + schema) behind an `authorizeAdmin` preHandler; endpoints per §8; admin provisioning via seed/DB.
  - **Services:** statistics aggregation; paginated user/ride listing; deactivate/reactivate (login block for users, `SUSPENDED` + search exclusion for rides).
  - **Frontend:** `AdminRoute` guard; AdminDashboard (stats), AdminUsers, AdminRides pages; `admin.api.js`.
  - **Tests:** admin API tests — RBAC enforcement (non-admin `403`), stats correctness, deactivation effects (deactivated user cannot log in; suspended ride absent from search). See §13 and §15.
- **Constraints:** no changes to existing seat-accounting, booking, or ownership logic; all CLAUDE.md rules (validation, auth, transactions, error shape, testing) apply unchanged.
- **Status:** ✅ Implemented, tested, and documented. Backend suite **67/67** (incl. `test/admin.test.js`); frontend build clean; additive migration `add_admin_module` applied; README API/demo/security sections updated. No phase 0–9 regressions.

---

## 13. Testing Strategy

- **Unit tests (services):** business rules in isolation — seat decrement/restore, ownership checks, past-date rejection, self-booking rejection, duplicate-active-booking rejection.
- **Concurrency test (critical):** parallel accepts on the last seat must result in exactly one success; `availableSeats` never goes negative.
- **Integration tests (routes):**
 each endpoint with auth, validation, and error paths against a test database.
- **E2E (happy paths):** register → publish → search → request → accept → cancel.
- **Admin API (Phase 10):** role-based access control (non-admin → `403`, unauthenticated → `401` on every admin route); dashboard statistics return correct counts/breakdowns; deactivating a user blocks their login; deactivating a ride (`SUSPENDED`) removes it from search; activate/deactivate are admin-only and idempotent; an admin cannot deactivate their own account.
- **Frontend:** component tests for key UI (RideCard, booking flow); manual responsive check.
- **Tooling:** a Node test runner (e.g., Vitest/Jest) for backend; isolated test DB; CI run on push.

---

## 14. Security Considerations

- **Passwords:** bcrypt-hashed; never stored or returned in plaintext.
- **JWT:** signed with a strong secret from env; short-lived access token; secret never committed.
- **Authorization:** ownership enforced on every mutation (ride owner accepts/rejects; booking owner cancels) → prevents IDOR.
- **Role-based access control (Phase 10):** admin-only endpoints require `role = ADMIN` via an `authorizeAdmin` guard; identity and role come from the signed JWT, never from client input. No API path lets a user self-promote to admin, and deactivated accounts (`isActive = false`) cannot authenticate.
- **Input validation:** Fastify JSON Schema on all route inputs; typed errors on failure.
- **SQL injection:** Prisma parameterizes all queries.
- **Rate limiting:** on auth and booking endpoints to deter brute force/abuse.
- **CORS:** restricted to the frontend origin.
- **Transport:** HTTPS in production.
- **Data exposure:** sensitive fields (email, phone) withheld from public ride listings until a booking relationship exists.
- **Secrets:** all via environment variables; `.env` gitignored, `.env.example` committed.
- **Concurrency safety:** transactional seat accounting with row locking prevents overselling (a correctness *and* integrity concern).

---

## 15. Admin Module Specification (Post-MVP)

The Admin Module adds platform oversight on top of the completed MVP without altering user-facing flows. It is built in **Phase 10**.

### 15.1 Admin authentication & provisioning
- Admins log in through the existing `POST /api/auth/login`. The JWT payload gains a `role` claim (`USER` | `ADMIN`).
- **There is no public path to become an admin.** The first admin is provisioned out-of-band — via the seed script or a direct DB/Prisma update promoting a known account to `role = ADMIN`.
- `authenticate` continues to verify the token; a new `authorizeAdmin` preHandler additionally requires `role = ADMIN`.

### 15.2 Role-based authorization
- Every `/api/admin/*` route runs `authenticate → authorizeAdmin → service`.
- Non-admin authenticated callers → `403`; unauthenticated → `401`. Role is read from the JWT, never from the request body.

### 15.3 Dashboard statistics
`GET /api/admin/stats` returns platform totals for the admin dashboard:
- **Users:** total, active, deactivated.
- **Rides:** total and counts by status (`ACTIVE`, `CANCELLED`, `COMPLETED`, `SUSPENDED`).
- **Bookings:** total and counts by status (`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`).

Counts use efficient aggregate queries (`count` / `groupBy`) and are read-only.

### 15.4 Viewing users and rides
- `GET /api/admin/users` and `GET /api/admin/rides` list records with pagination; `passwordHash` is never returned. Admin views may include fields hidden from public listings (e.g., email) because the caller is privileged.
- `GET /api/admin/users/:id` and `GET /api/admin/rides/:id` return a single record (`404` if absent).

### 15.5 Deactivation semantics
- **Deactivate user** (`PATCH /api/admin/users/:id/deactivate`): sets `isActive = false`. The user can no longer authenticate (login rejected; existing tokens rejected at `authenticate`). Reversible via `.../activate`.
- **Deactivate ride** (`PATCH /api/admin/rides/:id/deactivate`): sets `status = SUSPENDED`. Because search filters `status = ACTIVE`, the ride disappears from results immediately. This is distinct from a driver's `CANCELLED` (moderation vs. owner action). Reactivation returns the ride to `ACTIVE`.
- Deactivation never deletes data or mutates seat counts; booking/seat invariants are untouched.

### 15.6 Rules & guardrails
- Admin actions are authorization-gated and input-validated like every other endpoint (JSON Schema; typed errors; `{ error: { code, message } }`).
- **An admin cannot deactivate their own account** via the API (prevents self-lockout) — enforced in the service.
- All admin reads/writes use Prisma (parameterized); no raw SQL. Single-row writes need no transaction; any multi-step action stays transactional.

### 15.7 Testing (see §13)
- RBAC: non-admin/unauthenticated → `403`/`401` on every admin route.
- Stats: counts match seeded fixtures.
- Deactivation effects: deactivated user cannot log in; suspended ride excluded from search; self-deactivation blocked.

---

## Appendix — Key Edge Cases Tracked
- Race on the last seat (two simultaneous accepts) → transaction + row lock.
- Accept after seats already filled → re-check inside transaction → `409`.
- Ride edited to fewer seats than already accepted → guarded edit.
- Request exceeding available seats → `400`/`409`.
- Departure passes while booking still `PENDING` → treated as non-actionable (future: auto-expire job).
- Duplicate request (double submit) → one-active-booking rule.
- Timezone handling for travel date vs. server time → store UTC, compare consistently.
- **(Phase 10)** Admin self-lockout → service blocks an admin from deactivating their own account.
- **(Phase 10)** Deactivated user holding a valid token → rejected at `authenticate` on the next request (not just at login).
- **(Phase 10)** Admin `SUSPENDED` ride vs. driver `CANCELLED` ride → distinct statuses; both excluded from search, but reactivation only returns a `SUSPENDED` ride to `ACTIVE`.
