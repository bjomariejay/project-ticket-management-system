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
3. **Initialize the database** via `db-migration`
### to migrate setup first the psql: add `C:\Program Files\PostgreSQL\18\bin` to Environment Variables → System Variables → Path → restart pc
### after setup open there are 2 ways to migration:

 1st option run all migration: 
 > go to: package.json
 > add under scripts: "migrate": "for %f in (db-migration\\*.sql) do psql postgres://postgres:123@localhost:5432/project_ticket_management -f \"%f\"" 
 > run: npm run migrate

 2nd option run espicific file:
run on terminal > `psql -U postgres -d project_ticket_management -f migrationFile`
### migrationFile: `db-migration/V202603081225__update_name_to_users_tbl.sql`
### to drop db: `psql -U postgres -c "DROP DATABASE project_ticket_management;"`
### to create db: `psql -U postgres -c "CREATE DATABASE project_ticket_management;"`
### or run `migrationFile` script inside pgAdmin query tool

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

- **Authentication & Workspaces** – manages signup, login, and scoping users to their workspace so data stays organized.
- **Projects & Channels** – provide containers for tickets, giving teams flexibility whether they prefer project or channel metaphors.
- **Tickets** – the heart of the system, with creation, assignment, reviewer workflows, privacy controls, and threaded discussions.
- **Dashboards & Reports** – offer productivity snapshots plus reviewer- and project-level histories.
- **Notifications & DMs** – keep collaborators in sync through alerts and lightweight conversations.

## Database Docs

We document schema changes in `database.dbml`. Open it in [DBML](https://dbdiagram.io/home) or your favorite ERD viewer to review relationships, constraints, and seed values. Keeping the diagram in sync with migrations helps everyone reason about joins and indexes before touching SQL.

## Developer Workflow

Open 2 Terminals:
- **Terminal 1**: `cd backend && npm run dev` to start the API (`http://localhost:4000`).
- **Terminal 2**: `cd ts-fe-react && npm run dev` to start the UI (`http://localhost:5173`).

### Run BE 

1. RUN APPLICATOIN = type `npm run dev`
2. BE PORT = runs app with port 4000 check `.env`
3. check be with this end point http://localhost:4000/api/showUsers 
4. we implement showUsers by this strucutre > Route > Controller > Model > Database
#### ROUTE Check `index.js`(API Endpoint)
router.get('/showUsers', listPublicUsers);
#### CONTROLLER Check `userController.js`(Business Logic)
#### MODEL Check `userModel.js` (Database Queries)
#### DATABASE Check `database.js`
const { query } = require('../config/database');

### Run FE 

1. **Start the dev server** – from `ts-fe-react`, run `npm run dev`. Vite prints a `http://localhost:5173` URL when it spins up successfully.
2. **Port configuration** – Vite serves the UI on `5173` by default (see `vite.config.ts`). The app currently renders a single route, so every request resolves to `/`.
3. **Top-level routing** – `App.tsx` switches between `WorkspacePage` and `LoginPage`. Inside its `useEffect`, `isAuthenticated === true` shows the workspace, otherwise the login screen. `AppContent` is wrapped with both context providers so child components can share auth/workspace data:
   - `AuthProvider` – exposes the current user, login status, auth tokens, and persists them in `localStorage`.
   - `WorkspaceProvider` – shares workspace metadata (active workspace, members, etc.).
   - `AppContent` – main UI shell that consumes both contexts.
4. **Frontend ↔ Backend flow** – the login form demonstrates the communication pattern:
   - `LoginPage.tsx` owns the form validation and defines `handleLoginSubmit` on the `<form onSubmit={...}>`. 
   - `authContext.tsx` awaits the response from client.ts, stores the token + user payload in `localStorage`, and updates the context state.
   - `client.ts` calls the API helper, which forward the request to the backend.

5. **Inspect the login request** – attempt a login in the browser and capture the network request:
   - **Payload**: `{ "username": "jay", "password": "jay" }`
   - **Request URL**: `http://localhost:5173/api/auth/login` (Vite forwards `/api` calls to the backend port).
   - To trace the backend handler: `app.js (app.use('/api', apiRouter))` → `routes/index.js (router.use('/auth', authRoutes))` → `router.post('/login', login)` in `routes/authRoutes.js`.


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
