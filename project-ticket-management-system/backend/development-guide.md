# Backend Development Guide

## TECH STACK USED

fe: React
be: NodeJs Express(framework)
db: postgress

## CONNECTION

we can use 2 ways
1. pgAdmin 4 and to connect it with this way `postgres://postgres:123@localhost:5432/project_ticket_management` or check .env
   (port 5432 =  you can check the port in pgAdmin4 and go to dbname > right click then select query tool > run `Show port`).
   (password 123 = password is encrypted so we cant check the password in pgAdmin4 but can only update the password)
2. docker file just run docker-compose.yml using command docker-compose up -d


## project ticket management system module


## database docs 
check `database.dbml` for database diagram


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



















If the payload is missing fields or credentials fail validation, return the appropriate `400` or `401` JSON error `{ "message": "…" }`. This keeps the frontend contract aligned with `login(payload)` and ensures `res.data` always matches `LoginResponse` on success.

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
const crypto = require('crypto');
const { jwtSecret, tokenTtlSeconds } = require('../config/env');

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const base64UrlDecode = (value) => {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) {
    normalized += '=';
  }
  return Buffer.from(normalized, 'base64');
};

const createExpiryClaim = () => Math.floor(Date.now() / 1000) + tokenTtlSeconds;

const signToken = (payload) => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', jwtSecret).update(`${header}.${claims}`).digest()
  );
  return `${header}.${claims}.${signature}`;
};

const verifyToken = (token) => {
  const [header, claims, signature] = token.split('.');
  if (!header || !claims || !signature) {
    throw new Error('Invalid token structure');
  }
  const expectedSignature = base64UrlEncode(
    crypto.createHmac('sha256', jwtSecret).update(`${header}.${claims}`).digest()
  );
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error('Invalid token signature');
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid token signature');
  }
  const payload = JSON.parse(base64UrlDecode(claims).toString('utf8'));
  if (payload.exp !== undefined) {
    const expValue = Number(payload.exp);
    if (!Number.isFinite(expValue)) {
      throw new Error('Token expired');
    }
    const expMs = expValue > 1e12 ? expValue : expValue * 1000;
    if (Date.now() > expMs) {
      throw new Error('Token expired');
    }
  }
  return payload;
};

module.exports = { createExpiryClaim, signToken, verifyToken };
````
