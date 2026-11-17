import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { HttpError } from './database.ts';

// OWASP's scrypt alternative: N=2^15, r=8, p=3. Bound per-process work as well as DB-backed attempts.
let runningHashes = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (runningHashes >= 4) throw new HttpError(503, 'AUTH_BUSY', 'Authentication is busy. Try again shortly.');
  runningHashes++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error); else resolve(key);
      });
    });
  } finally { runningHashes--; }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  if (!match) return false;
  const actual = await derive(password, match[1]!);
  return timingSafeEqual(actual, Buffer.from(match[2]!, 'hex'));
}

export function readBearerToken(header: string | undefined) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header ?? '');
  if (!match) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return match[1]!;
}

// Unknown emails incur the same password derivation cost as known accounts.
export const dummyPasswordHash = `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`;
