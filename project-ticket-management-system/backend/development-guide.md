# Backend Development Guide

## Authentication Requests

When the frontend issues `login(payload: LoginPayload)`

```ts
login(payload: LoginPayload) {
  return this.client.post<LoginResponse>('/auth/login', payload).then((res) => res.data);
}
```

make sure the backend `/api/auth/login` route is reachable and expects:
/api/auth/login = is defined in `backend/routes/authRoutes.js` which uses login from `backend/controllers/authController.js`

- `username` **or** `handle`: the account identifier, normalized to lowercase before lookup.
- `password`: the plaintext value, which the server validates against the stored scrypt hash.

On success the backend responds with `LoginResponse`:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "…",
    "displayName": "…",
    "username": "…",
    "handle": "…",
    "location": "…",
    "workspaceId": "…",
    "workspaceName": "…",
    "isActive": true
  }
}
```

If the payload is missing fields or credentials fail validation, return the appropriate `400` or `401` JSON error `{ "message": "…" }`. This keeps the frontend contract aligned with `login(payload)` and ensures `res.data` always matches `LoginResponse` on success.
