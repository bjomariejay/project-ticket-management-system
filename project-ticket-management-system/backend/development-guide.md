# Backend Development Guide

## Contents

- Quick Start
- Tech Stack
- Project Structure
- Environment & Database Access
- Module Overview
- Database Docs
- Developer Workflow
- Login Endpoint Reference
- JWT Implementation

## Quick Start

1. **Install prerequisites** – Node.js 18+, npm 9+, PostgreSQL 14+ (or Docker Desktop if you prefer containers).
2. **Install dependencies** by running `npm install` inside both `backend` and `ts-fe-react`.
3. **Initialize the database** via `psql -f db-init.sql` to check if it works do the following:

### go to pgAdmin > open query tool > and run select * from users > verify the name column for the user jaylingers 
### > Update db-init.sql > Open the db-init.sql file in your editor. >  Search for all instances of jaylingers. > Replace them with your desired name, e.g., jay.
### add `C:\Program Files\PostgreSQL\18\bin` to Environment Variables → System Variables → Path
### open cmd then cd `project file` and run the following
`psql -U postgres -c "DROP DATABASE project_ticket_management;"`
`psql -U postgres -c "CREATE DATABASE project_ticket_management;"`
`psql -U postgres -d project_ticket_management -f db-init.sql`
### or run `db-init.sql` script inside pgAdmin query tool

## Tech Stack

- **Frontend**: React + Vite + TypeScript (living in `ts-fe-react`).
- **Backend**: Node.js with Express 5 framework.
- **Database**: PostgreSQL accessed through the native `pg` driver in database.js

## Project Structure

- `backend/` – routes, controllers, models, middleware, and config.
- `ts-fe-react/` –api, components, context, hooks, pages, types and utils.
- `database.dbml` – Canonical schema or DB structure.

Most backend code follows a simple layering pattern: **routes → controllers → models/utilities**. When adding features, keep business logic in models/helpers so routes stay thin.

## Environment & Database Access

You can connect to the database in two supportive ways, depending on your workflow:

1. **pgAdmin 4 (GUI)** – connect with `postgres://postgres:123@localhost:5432/project_ticket_management` or the DSN stored in `.env`.
   - Confirm the port via pgAdmin: right-click the database → Query Tool → run `SHOW port;`.
   - Passwords encrypted with HASHED so we can only update password.
2. **Docker Compose** – run `docker-compose up -d` from the repo root. Containers start PostgreSQL plus any supporting services with predictable ports.

## Module Overview

Think of the platform as a constellation of focused modules working together:

- **Authentication & Workspaces** – manages signup, login, and scoping users to their workspace so data stays organized.
- **Projects & Channels** – provide containers for tickets, giving teams flexibility whether they prefer project or channel metaphors.
- **Tickets** – the heart of the system, with creation, assignment, reviewer workflows, privacy controls, and threaded discussions.
- **Dashboards & Reports** – offer productivity snapshots plus reviewer- and project-level histories.
- **Notifications & DMs** – keep collaborators in sync through alerts and lightweight conversations.

## Database Docs

We document schema changes in `database.dbml`. Open it in [DBML](https://dbdiagram.io/home) or your favorite ERD viewer to review relationships, constraints, and seed values. Keeping the diagram in sync with migrations helps everyone reason about joins and indexes before touching SQL.

## Developer Workflow

Run the frontend and backend simultaneously for the smoothest development loop:

- **Terminal 1**: `cd backend && npm run dev` to start the API (`http://localhost:4000`).
- **Terminal 2**: `cd ts-fe-react && npm run dev` to start the UI (`http://localhost:5173`).

### Check BE WORKS

1. BE Structures = Route → Controller → Model → Database
2. BE PORT = BE runs app with port 4000 check .env
3. RUN APPLICATOIN = type npm run dev
4. open this end point http://localhost:4000/api/showUsers we see the users data
5. implement showUsers =

#### ROUTE `index.js`(API Endpoint)

router.get('/showUsers', listPublicUsers);

#### CONTROLLER `userController.js`(Business Logic)

const listPublicUsers = asyncHandler(async (req, res) => {
const rows = await getAllUsers();
res.json(rows);
});

#### MODEL `userModel.js` (Database Queries)

    const getAllUsers = async () => {
    const { rows } = await query(
    SELECT u.id,
    u.display_name,
    u.username,
    u.handle,
    u.location,
    u.workspace_id,
    w.name AS workspace_name,
    u.is_active AS is_active
    FROM users u
    LEFT JOIN workspaces w ON u.workspace_id = w.id
    ORDER BY u.display_name
    );
    return rows.map((row) => mapUser(row));
    };

#### DATABASE `database.js`

    const { query } = require('../config/database');

### Check FE WORKS

## Login Endpoint Reference

- **Request**: `POST http://localhost:4000/api/auth/login`
- **Payload**: `{ "username": "jay", "password": "supersecret" }`
- **Response**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "displayName": "Jaylingers",
    "username": "jay",
    "handle": "admin",
    "location": "HQ",
    "workspaceId": "aaaaaaaa-1111-1111-1111-111111111111",
    "workspaceName": "CYBER-Workspace",
    "isActive": true
  }
}
```

If required fields are missing or credentials fail validation, return a descriptive `400` or `401` JSON error (`{ "message": "Invalid credentials" }`). Consistent responses keep the frontend hooks aligned with the `LoginResponse` type and make debugging effortless.

## JWT Implementation

The backend ships with a lightweight JWT helper at `backend/utils/token.js`:

1. Encode a header `{ alg: 'HS256', typ: 'JWT' }` and payload (e.g., `{ userId, handle, workspaceId, exp }`) via `base64UrlEncode`.
2. Concatenate `header.claims` and sign with `crypto.createHmac('sha256', jwtSecret)` where `jwtSecret` comes from `backend/config/env.js` (defaults to `dev-secret`, but production must set `JWT_SECRET`).
3. Append the signature to form `header.claims.signature`.

Tokens include an `exp` claim built by `createExpiryClaim()`, which adds `JWT_TTL_SECONDS` (default 8 hours) to the current timestamp. During verification (`verifyToken()`):

- We recompute the HMAC signature and compare using `crypto.timingSafeEqual` to avoid timing attacks.
- The base64-decoded payload is parsed and its `exp` claim is validated (supports seconds or milliseconds).
- Invalid structure, signature, or expiry throws an error so the request receives a 401.

`middleware/authenticate.js` uses `verifyToken()` to populate `req.user` for protected routes. Anything mounted after `router.use(authenticate)` (see `backend/routes/index.js`) automatically benefits from JWT enforcement.

```js
const crypto = require("crypto");
const { jwtSecret, tokenTtlSeconds } = require("../config/env");

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const base64UrlDecode = (value) => {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) {
    normalized += "=";
  }
  return Buffer.from(normalized, "base64");
};

const createExpiryClaim = () => Math.floor(Date.now() / 1000) + tokenTtlSeconds;

const signToken = (payload) => {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    crypto
      .createHmac("sha256", jwtSecret)
      .update(`${header}.${claims}`)
      .digest(),
  );
  return `${header}.${claims}.${signature}`;
};

const verifyToken = (token) => {
  const [header, claims, signature] = token.split(".");
  if (!header || !claims || !signature) {
    throw new Error("Invalid token structure");
  }
  const expectedSignature = base64UrlEncode(
    crypto
      .createHmac("sha256", jwtSecret)
      .update(`${header}.${claims}`)
      .digest(),
  );
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid token signature");
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(base64UrlDecode(claims).toString("utf8"));
  if (payload.exp !== undefined) {
    const expValue = Number(payload.exp);
    if (!Number.isFinite(expValue)) {
      throw new Error("Token expired");
    }
    const expMs = expValue > 1e12 ? expValue : expValue * 1000;
    if (Date.now() > expMs) {
      throw new Error("Token expired");
    }
  }
  return payload;
};

module.exports = { createExpiryClaim, signToken, verifyToken };
```
