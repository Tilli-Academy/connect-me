# Carpooling Platform

A production-quality carpooling web app where any authenticated user can **publish rides** (as a driver) and **book seats** (as a passenger). Roles are per-action, not per-account. Seat availability stays correct even under concurrent accepts, enforced by transactional row locking on a denormalized, authoritative seat count.

> **Project docs:** [`plan.md`](./plan.md) is the source-of-truth design (architecture, schema, workflows, phases). [`CLAUDE.md`](./CLAUDE.md) holds the binding development rules.

---

## Table of contents
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Database setup](#database-setup)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Demo data](#demo-data)
- [API reference](#api-reference)
- [Testing](#testing)
- [Security notes](#security-notes)
- [Known issues / residual vulnerabilities](#known-issues--residual-vulnerabilities)
- [Project structure](#project-structure)

---

## Architecture

A 3-tier, stateless API. Identity travels in a JWT (no server-side sessions). The backend request flow is fixed:

```
route (JSON-Schema validated) → authenticate → authorize → service → prisma → PostgreSQL
```

- **Routes** declare the HTTP contract and validation only — no business logic.
- **Services** own all business rules and every multi-step write.
- **All seat-changing writes run inside `prisma.$transaction` with `SELECT … FOR UPDATE` row locks.** `Ride.availableSeats` is the authoritative, denormalized remaining-seat count.
- **Cross-cutting concerns are Fastify plugins:** `prisma`, `auth`, `rateLimit`, `errorHandler`, plus `helmet` and `cors`.

## Tech stack

| Layer     | Technology                                              |
|-----------|---------------------------------------------------------|
| Frontend  | React, Vite, React Router, Tailwind CSS                 |
| Backend   | Node.js, Fastify 5                                       |
| ORM       | Prisma 5                                                 |
| Database  | PostgreSQL                                               |
| Auth      | JWT (Bearer) + bcrypt                                    |
| Validation| Fastify JSON Schema                                      |
| Testing   | Vitest (backend integration + concurrency)              |

---

## Prerequisites

- **Node.js** ≥ 18 (developed/tested on v20)
- **npm** ≥ 9
- **PostgreSQL** 14+ — easiest via Docker (see below)
- **Docker** (optional, for the database)

---

## Quick start

```bash
# 1. Start PostgreSQL (Docker example; see Database setup for details)
docker run -d --name carpool-postgres \
  -e POSTGRES_USER=carpool -e POSTGRES_PASSWORD=carpool -e POSTGRES_DB=carpool \
  -p 5433:5432 postgres:16

# 2. Backend
cd backend
cp .env.example .env            # then edit: set JWT_SECRET, confirm DATABASE_URL
npm install
npm run migrate                 # apply Prisma migrations
npm run db:seed                 # optional: load demo users/rides/bookings
npm run dev                     # API on http://localhost:3100

# 3. Frontend (in a second terminal)
cd frontend
npm install
npm run dev                     # app on http://localhost:5173 (proxies /api to the backend)
```

---

## Database setup

1. **Provision PostgreSQL.** The Docker command above maps container port `5432` to host `5433` (to avoid colliding with a local Postgres on 5432). Adjust the port to taste and keep `DATABASE_URL` in sync.

2. **Configure the connection** in `backend/.env`:
   ```
   DATABASE_URL=postgresql://carpool:carpool@localhost:5433/carpool?schema=public
   ```

3. **Apply migrations** (creates the `User`, `Ride`, `Booking` tables, enums, and indexes):
   ```bash
   cd backend
   npm run migrate          # prisma migrate deploy — for an existing migration history
   # or, when iterating on the schema locally:
   npm run migrate:dev      # prisma migrate dev
   ```

4. **Seed demo data** (optional, idempotent):
   ```bash
   npm run db:seed
   ```

The schema is defined in [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma). **All schema changes go through Prisma migrations — never hand-edit the database.**

---

## Environment variables

Every secret and environment-specific value comes from env vars. `.env` is gitignored; `.env.example` is committed. The app loads/validates env in `backend/src/config/env.js` and fails fast if a required var is missing.

### Backend (`backend/.env`)

| Variable         | Required | Default | Description                                                         |
|------------------|----------|---------|---------------------------------------------------------------------|
| `DATABASE_URL`   | ✅       | —       | PostgreSQL connection string.                                       |
| `JWT_SECRET`     | ✅       | —       | Secret for signing access tokens. Generate a long random value.     |
| `PORT`           | ❌       | `3000`  | API port. (This repo's local dev uses `3100`.)                      |
| `HOST`           | ❌       | `0.0.0.0` | Bind address.                                                     |
| `CORS_ORIGIN`    | ❌       | frontend dev origin | Allowed browser origin for the API.                     |
| `JWT_EXPIRES_IN` | ❌       | `7d`    | Access-token lifetime. Refresh tokens are deferred post-MVP.        |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend (`frontend/.env`)

| Variable        | Required | Description                                                                 |
|-----------------|----------|-----------------------------------------------------------------------------|
| `VITE_API_URL`  | ❌       | Only for builds where the API is on a different origin. Local dev uses the Vite proxy and relative `/api` paths, so this is not needed. |

See [`backend/.env.example`](./backend/.env.example) and [`frontend/.env.example`](./frontend/.env.example) for the full templates.

---

## Running the app

| Command                 | Location    | What it does                                   |
|-------------------------|-------------|------------------------------------------------|
| `npm run dev`           | `backend/`  | Start the API with file-watch (hot reload).    |
| `npm start`             | `backend/`  | Start the API (production-style).              |
| `npm run migrate`       | `backend/`  | Apply Prisma migrations (`migrate deploy`).    |
| `npm run db:seed`       | `backend/`  | Load idempotent demo data.                     |
| `npm test`              | `backend/`  | Run the Vitest suite.                          |
| `npm run dev`           | `frontend/` | Start the Vite dev server (proxies `/api`).    |
| `npm run build`         | `frontend/` | Production build into `frontend/dist/`.        |
| `npm run preview`       | `frontend/` | Preview the production build locally.          |

---

## Demo data

`npm run db:seed` creates four demo users (all under the `@demo.carpool` domain) with the **dev-only** password `password123`:

| Email               | Name           | Notes                                              |
|---------------------|----------------|----------------------------------------------------|
| `alice@demo.carpool`| Alice Driver   | Publishes Springfield → Shelbyville.               |
| `bob@demo.carpool`  | Bob Passenger  | ACCEPTED on Alice's ride; PENDING on Carol's ride. |
| `carol@demo.carpool`| Carol Both     | Publishes Springfield → Capital City.              |
| `admin@demo.carpool`| Admin User     | **Role `ADMIN`** — access the admin module (Phase 10). |

The seed is idempotent — it wipes and recreates only `@demo.carpool` records on each run, leaving other data untouched. These accounts are for local development only and must never exist in a real deployment.

---

## API reference

Base path: `/api`. All bodies are JSON. Protected endpoints require `Authorization: Bearer <token>`. Errors use a consistent shape: `{ "error": { "code", "message" } }`.

### Auth
| Method | Path                         | Auth | Description                                   |
|--------|------------------------------|------|-----------------------------------------------|
| POST   | `/api/auth/register`         | —    | Create an account; returns `{ token, user }`. |
| POST   | `/api/auth/login`            | —    | Log in; returns `{ token, user }`.            |
| GET    | `/api/auth/me`               | ✅   | Current user from the token.                  |
| POST   | `/api/auth/change-password`  | ✅   | Change own password (verifies current).       |

### Users
| Method | Path             | Auth | Description                                  |
|--------|------------------|------|----------------------------------------------|
| GET    | `/api/users/me`  | ✅   | Own profile (never returns `passwordHash`).  |
| PATCH  | `/api/users/me`  | ✅   | Update editable profile fields.              |

### Rides
| Method | Path                       | Auth | Description                                                      |
|--------|----------------------------|------|------------------------------------------------------------------|
| POST   | `/api/rides`               | ✅   | Publish a ride (as driver).                                      |
| GET    | `/api/rides`               | optional | Search by `origin`, `destination`, `date`. Excludes full/cancelled/past rides and (if authed) the caller's own. |
| GET    | `/api/rides/:id`           | —    | Public ride details (driver name, not email).                    |
| PATCH  | `/api/rides/:id`           | ✅   | Edit own ride (owner only); recomputes `availableSeats`.         |
| DELETE | `/api/rides/:id`           | ✅   | Cancel own ride (owner only).                                    |
| GET    | `/api/rides/mine/offered`  | ✅   | Caller's published rides (with pending-request counts).          |
| GET    | `/api/rides/:id/bookings`  | ✅   | Booking requests for a ride (ride owner only).                   |

### Bookings
| Method | Path                          | Auth | Description                                                   |
|--------|-------------------------------|------|---------------------------------------------------------------|
| POST   | `/api/bookings`               | ✅   | Request seats on a ride (as passenger).                       |
| GET    | `/api/bookings/mine`          | ✅   | Caller's own bookings.                                        |
| PATCH  | `/api/bookings/:id/accept`    | ✅   | Accept a request (ride owner only); decrements seats in a locked transaction. |
| PATCH  | `/api/bookings/:id/reject`    | ✅   | Reject a request (ride owner only); no seat change.           |
| PATCH  | `/api/bookings/:id/cancel`    | ✅   | Cancel own booking (passenger); restores seats if it was accepted. |

### Admin (Phase 10)
Every route requires a token whose account has role `ADMIN` (enforced by the `authorizeAdmin` guard). Non-admins get `403`, unauthenticated `401`. Admins are provisioned via seed/DB — there is no self-service promotion.

| Method | Path                               | Auth | Description                                                   |
|--------|------------------------------------|------|---------------------------------------------------------------|
| GET    | `/api/admin/stats`                 | admin | Dashboard totals for users, rides, bookings (with status breakdowns). |
| GET    | `/api/admin/users`                 | admin | List users, paginated (`?limit=&offset=`); never returns `passwordHash`. |
| GET    | `/api/admin/users/:id`             | admin | View a single user.                                          |
| PATCH  | `/api/admin/users/:id/deactivate`  | admin | Deactivate a user (`isActive=false`) — blocks login and existing tokens. |
| PATCH  | `/api/admin/users/:id/activate`    | admin | Reactivate a user (`isActive=true`).                         |
| GET    | `/api/admin/rides`                 | admin | List all rides, any status, paginated.                      |
| GET    | `/api/admin/rides/:id`             | admin | View a single ride.                                         |
| PATCH  | `/api/admin/rides/:id/deactivate`  | admin | Suspend a ride (`status=SUSPENDED`) — removed from search.   |
| PATCH  | `/api/admin/rides/:id/activate`    | admin | Reactivate a suspended ride (`status=ACTIVE`).              |

An admin cannot deactivate their own account (`403 ADMIN_SELF_DEACTIVATION`).

### Health
| Method | Path           | Auth | Description        |
|--------|----------------|------|--------------------|
| GET    | `/api/health`  | —    | Liveness check.    |

**Status codes:** `200/201` success · `400` validation · `401` unauthenticated · `403` forbidden/ownership · `404` not found · `409` conflict (e.g., no seats, already departed, duplicate booking).

---

## Testing

The backend has an integration + concurrency suite (Vitest) that runs against a **real PostgreSQL** test database (it uses `DATABASE_URL`; test data is namespaced by `*.test` email domains and cleaned up).

```bash
cd backend
npm test            # run the full suite once
npx vitest          # watch mode
npx vitest run test/bookings.test.js   # a single file
```

Coverage highlights:
- **Auth:** register/login, token guarding, change-password.
- **Profile:** read/update, immutability of email/password, validation.
- **Rides:** publish, past-date rejection, ownership on edit/cancel, seat recompute, public-field exposure.
- **Search:** origin/destination/date filtering, case-insensitivity, exclusion of full/cancelled/past/own rides.
- **Bookings:** request rules (duplicate, over-capacity, cancelled ride), accept/reject/cancel, seat decrement/restore.
- **Concurrency (critical):** two simultaneous accepts on the last seat → exactly one succeeds; `availableSeats` never goes negative.
- **Hardening:** security headers present, departed-ride accept blocked (409), auth rate limiting (429).
- **Admin (Phase 10):** RBAC (non-admin `403`, unauthenticated `401`); stats shape/consistency; deactivated user can't log in and their existing token is rejected; suspended ride absent from search; self-deactivation blocked.

**Frontend:** production build is verified via `npm run build`; responsive UI is checked manually.

---

## Security notes

- Passwords hashed with **bcrypt** (cost 12); never stored or returned in plaintext.
- JWT signed with a strong env secret; short-lived access token; secret never committed.
- **Authorization enforced on every mutation and user-scoped read** — identity is always derived from the JWT, never from client-supplied IDs (prevents IDOR).
- **Role-based access control (Phase 10):** admin-only routes require `role = ADMIN` (`authorizeAdmin` guard); role comes from the JWT/DB, never client input, and no endpoint lets a user self-promote. Deactivated accounts (`isActive = false`) are rejected at login **and** on their next authenticated request.
- All inputs validated with Fastify JSON Schema; invalid input → `400`.
- Prisma parameterizes all queries; raw SQL (for row locks) uses parameterized tagged templates only.
- **Rate limiting** on auth endpoints (register 5/min, login 10/min) plus a global 100/min baseline.
- **Helmet** security headers; **CORS** restricted to the configured frontend origin.
- Transactional seat accounting with row locking prevents overselling.
- Centralized error handler returns a safe, generic message for `500`s (no stack traces or internals leaked).

---

## Known issues / residual vulnerabilities

`npm audit` reports vulnerabilities that **only have breaking-change (`--force`) fixes**. These are intentionally deferred (no forced major upgrades without review); none sit in the production request path.

**Backend (14):**
- `tar` ← bcrypt's `@mapbox/node-pre-gyp` — **install/build-time only**, not in the runtime path. Fix requires `bcrypt@6` (breaking).
- `tinypool` ← Vitest — **dev/test dependency only**, never shipped. Fix requires `vitest@4` (breaking).

**Frontend (4):**
- `esbuild`/`vite` dev-server advisory — **dev server only**, not the production bundle. Fix requires `vite@8` (breaking).
- `react-router` open-redirect / SSR hydration advisories. Fix requires `react-router-dom@7` (breaking).

`npm audit fix` without `--force` resolves none of these. Schedule the breaking upgrades as a separate, regression-tested maintenance task.

**Operational note:** the API performs graceful shutdown on `SIGINT`/`SIGTERM`. Run it via `node src/server.js` (or `npm start`) so the signal reaches the Node process directly.

---

## Project structure

```
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # User, Ride, Booking models (plan.md §7)
│   │   ├── migrations/          # Prisma migration history
│   │   └── seed.js              # idempotent demo data
│   ├── src/
│   │   ├── app.js               # build/configure Fastify (plugins, routes)
│   │   ├── server.js            # listen + graceful shutdown
│   │   ├── config/env.js        # env loading/validation
│   │   ├── lib/                 # hash.js, errors.js
│   │   ├── plugins/             # prisma, auth, errorHandler
│   │   └── modules/             # feature slices: auth, users, rides, bookings, health, admin
│   │       └── <feature>/       #   <feature>.routes.js / .service.js / .schema.js
│   └── test/                    # Vitest integration + concurrency suite
├── frontend/
│   └── src/
│       ├── api/                 # HTTP client layer (all requests go through here)
│       ├── context/             # AuthContext
│       ├── hooks/               # data hooks
│       ├── components/          # presentational components
│       ├── pages/               # route pages (incl. pages/admin/ for Phase 10)
│       └── routes/              # ProtectedRoute + AdminRoute guards
├── plan.md                      # source-of-truth design
├── CLAUDE.md                    # binding development rules
└── README.md
```
