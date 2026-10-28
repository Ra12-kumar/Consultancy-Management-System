import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Random, URL-safe tokens (sessions, verification and reset links). Only their sha256 hash is stored.
export const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// Encryption at rest for small secrets the app must read back later (e.g. a verification link waiting in the
// email outbox). AES-256-GCM with a key derived from SESSION_SECRET. Rotating the secret makes old values unreadable.
const key = crypto.createHash('sha256').update(`email-outbox:${env.SESSION_SECRET}`).digest();

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Malformed encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
