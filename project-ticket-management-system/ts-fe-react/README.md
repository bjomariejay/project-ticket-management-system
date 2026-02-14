# ts-fe-react

React + TypeScript rewrite of the mission control workspace. The code was ported from the existing Angular frontend and keeps the same data model (projects, tickets, notifications, direct messages, dashboard).

## Available scripts

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run test
```

The app expects the backend API to run locally. During development Vite proxies `/api` to `http://localhost:4000`, so the default `.env.development` sets `VITE_API_URL=/api`. Adjust or remove that env var if your backend lives elsewhere.
