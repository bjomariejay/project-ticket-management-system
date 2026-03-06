// Shared backend type declarations.
// Extend this file when introducing TypeScript or JSDoc-based tooling.

export interface JwtPayload {
  userId: string;
  handle: string;
  workspaceId: string;
  exp: number;
}
