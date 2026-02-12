# Project and Ticket Management System

A Slack-inspired collaboration workspace that combines an Angular frontend with a Node.js/Express API, PostgreSQL storage, and Dockerized infrastructure. Teams can spin up channels, create tickets with automatic numbering per channel, manage ticket membership, log "report of work" updates (including the special `start ticket` trigger), send mentions that feed an activity center, and exchange direct messages.

## Tech Stack

- **Frontend**: Angular 18 (standalone APIs, SCSS, HttpClient)
- **Backend**: Node.js 20, Express 5, PostgreSQL driver (`pg`)
- **Database**: PostgreSQL with relational schema for users, channels, tickets, logs, notifications, and DMs
- **Containerization**: Docker + Docker Compose (backend API and PostgreSQL only)

## Running the backend with Docker Compose

```bash
cd backend
docker compose up --build
```

Services:
- Express API on <http://localhost:4000>
- PostgreSQL exposed on port `5432` (credentials: postgres/postgres, database `project_ticket_management`)

The database container automatically runs `backend/db-init.sql` on first boot to create tables, triggers, and seed users/channels so ticket numbering like `hrms-0001` works immediately.

## Local Development (without Docker)

1. **Backend**
   ```bash
   cd backend
   cp .env.example .env   # adjust if needed
   npm install
   npm start
   ```
   The API expects PostgreSQL reachable at the `DATABASE_URL` defined in `.env`.

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm start   # ng serve, defaults to http://localhost:4200
   ```

The Angular app points to `http://localhost:4000/api` by default (see `src/environments`). Update the value if you expose the backend elsewhere.

## Feature Highlights

- Slack-like workspace chrome with dark sidebar, channel list, and tabs for **Home**, **DMs**, and **Activity**.
- Ticket creation per channel automatically generates prefixes (e.g., HRMS-0001) based on configurable channel sequences.
- Ticket membership enforcement: creators can work immediately, other teammates click *Join ticket* before contributing. Joining is logged in the report-of-work feed.
- Conversation threads with `@mentions` (or `@cebu` to notify every Cebu-based teammate) feed activity notifications. Typing `start ticket` updates ticket status and logs the work start.
- Dashboard cards summarizing each teammate's open/in-progress/archived counts and estimated hours closed.
- DM panel that logs direct messages and mirrors Slack's sidebar DM tab.
- Activity stream tab listing unread/read notifications with quick *Mark read* controls.
- Docker-ready infrastructure for easy bootstrap in demos or CI.

## Testing & Linting

- Angular unit test placeholder lives in `frontend/src/app/app.component.spec.ts`.
- Backend currently focuses on API ergonomics; add Jest or another framework as needed for deeper validation.

Feel free to extend the schema or UI to integrate authentication, richer analytics, or WebSocket updates.
