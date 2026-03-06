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
