# Backend Development Guide

## TECH STACK USED

- fe: React
- be: NodeJs Express (framework)
- db: PostgreSQL (a dependable relational database with migrations and SQL tooling)

## CONNECTION

You can connect to the database in two supportive ways, depending on which workflow you prefer:

1. **pgAdmin 4 (GUI)** – connect with `postgres://postgres:123@localhost:5432/project_ticket_management` or whatever credentials you configure in `.env`.
   - Port 5432: confirm the port inside pgAdmin by opening the database, right-clicking, choosing **Query Tool**, and running `SHOW port;`.
   - Password 123: pgAdmin stores a hashed version, so you won't see the raw value there—update it via the UI if needed.
2. **Docker Compose (hands-off)** – simply run `docker-compose up -d` and let containers spin up the database and any supporting services. It's a fantastic option when you want a consistent environment fast.

## MODULES

- **Authentication & Workspaces** – manages signup, login, and scoping users to their workspace so data stays organized.
- **Projects & Channels** – provide lightweight containers for tickets, giving teams flexibility whether they prefer project or channel metaphors.
- **Tickets** – the heart of the system, with creation, assignment, reviewer workflows, privacy controls, and threaded discussions.
- **Dashboards & Reports** – surface productivity snapshots plus reviewer- and project-level histories to keep momentum visible.
- **Notifications & DMs** – help collaborators stay in sync through real-time nudges and direct conversations without leaving the workspace.

Treat each module as an API boundary: controllers should stay lean, business logic belongs in models/services, and shared utilities live under `utils/`. Following that discipline keeps the codebase approachable as it grows.

## DATABASE DOCS

check `database.dbml` for database diagram

## DEVELOPER WORKFLOW

There are 2 folders in our project: `backend` and `ts-fe-react`. A smooth workflow is to open two terminals so both apps can run concurrently:

- **Terminal 1**: `cd backend` then `npm run dev` to launch the API at `http://localhost:4000` (or your configured port).
- **Terminal 2**: `cd ts-fe-react` then `npm run dev` to start Vite on `http://localhost:5173`.

### Check BE WORKS

1. BE FLOW = Route → Controller → Model → Database
2. BE PORT = BE application runs app with port 4000 check .env
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


## Login Page

user send payload reqeust: username, password
request url: http://localhost:5173/api/auth/login

response:
{
"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJoYW5kbGUiOiJhZG1pbiIsIndvcmtzcGFjZUlkIjoiYWFhYWFhYWEtMTExMS0xMTExLTExMTEtMTExMTExMTExMTExIiwiZXhwIjoxNzcyODkyNjA3fQ.dDMno2Zh-5EaYlVzcE1aHX3coOASs6z1o_RLpiRtJUA",
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

If the payload is missing fields or credentials fail validation, return the appropriate `400` or `401` JSON error `{ "message": "…" }`. This keeps the frontend contract aligned with `login(payload)` and ensures `res.data` always matches `LoginResponse` on success. Thoughtful error handling is a small touch that makes the entire experience more trustworthy for users and developers alike.

## Implement JWT

The backend ships with a small, dependency-free JWT helper at `backend/utils/token.js`. We generate tokens by:

1. Encoding a header `{ alg: 'HS256', typ: 'JWT' }` and the payload (e.g., `{ userId, handle, workspaceId, exp }`) via our `base64UrlEncode` helper.
2. Concatenating `header.claims` and signing with `crypto.createHmac('sha256', jwtSecret)` where `jwtSecret` comes from `backend/config/env.js`. The secret defaults to `dev-secret`, but production must set `JWT_SECRET`.
3. Returning `header.claims.signature` as the token string.

Tokens include an `exp` claim built by `createExpiryClaim()`, which adds `JWT_TTL_SECONDS` (default 8 hours) to the current timestamp. During verification (`verifyToken()`):

- We recompute the HMAC signature and compare using `crypto.timingSafeEqual` to avoid timing attacks.
- The base64-decoded payload is parsed and its `exp` claim is validated (supports seconds or ms).
- If the structure, signature, or expiry is invalid, an error is thrown and the request receives a 401.

`middleware/authenticate.js` uses `verifyToken()` to populate `req.user` for protected routes. Anything mounted after `router.use(authenticate)` (see `backend/routes/index.js`) automatically benefits from JWT enforcement.

### Reference implementation (`backend/utils/token.js`)

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
