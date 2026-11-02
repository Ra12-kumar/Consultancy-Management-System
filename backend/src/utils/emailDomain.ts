import dns from 'node:dns/promises';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

// Checks that an email's domain can receive mail at all (RFC 5321: MX records, or an address record when there
// is no MX; RFC 7505: a "null MX" means the domain accepts no mail). It catches typos such as "gmial.con" and
// made-up domains before an account is created. It does not prove the mailbox exists: the emailed code does.
// When DNS itself fails (timeout, no network) the address is allowed, so an outage never blocks sign-ups.

export type DomainResolver = {
  resolveMx: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
  resolve4: (domain: string) => Promise<string[]>;
  resolve6: (domain: string) => Promise<string[]>;
};

const TIMEOUT_MS = 3000;
const NO_DOMAIN = new Set(['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'EBADNAME']);
const UNREACHABLE = new Set(['ECONNREFUSED', 'ETIMEOUT', 'ECONNRESET', 'EREFUSED']);

// Node sometimes gets an unusable DNS server from the OS (e.g. 127.0.0.1 on Windows with nothing listening
// there). When the system resolver cannot be reached, public resolvers are asked instead; only the domain
// name (never the full address) leaves the server.
const publicDns = new dns.Resolver({ timeout: TIMEOUT_MS, tries: 1 });
publicDns.setServers(['1.1.1.1', '8.8.8.8']);
const withFallback =
  <T>(fn: (r: DomainResolver, d: string) => Promise<T>) =>
  async (d: string) => {
    try {
      return await fn(dns, d);
    } catch (err) {
      if (!UNREACHABLE.has((err as { code?: string }).code ?? '')) throw err;
      return fn(publicDns, d);
    }
  };
const systemDns: DomainResolver = {
  resolveMx: withFallback((r, d) => r.resolveMx(d)),
  resolve4: withFallback((r, d) => r.resolve4(d)),
  resolve6: withFallback((r, d) => r.resolve6(d)),
};
let resolver: DomainResolver = systemDns;
// On by default; off in automated tests (their addresses use example.com, which by design accepts no mail)
// unless a test injects a resolver. EMAIL_DOMAIN_CHECK=false turns it off.
let enabled = env.EMAIL_DOMAIN_CHECK !== 'false' && !env.isTest;
const cache = new Map<string, { at: number; ok: boolean }>();
const CACHE_MS = 60 * 60_000;

// Tests inject a stub resolver.
export function setDomainResolver(r: DomainResolver | null) {
  resolver = r ?? systemDns;
  enabled = r ? true : env.EMAIL_DOMAIN_CHECK !== 'false' && !env.isTest;
  cache.clear();
}

const withTimeout = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), TIMEOUT_MS))]);
const code = (err: unknown) => (err as { code?: string }).code ?? '';

async function lookup(domain: string): Promise<boolean> {
  try {
    const mx = await withTimeout(resolver.resolveMx(domain));
    if (mx.length) return mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (err) {
    if (!NO_DOMAIN.has(code(err))) return true;
    if (code(err) === 'ENOTFOUND') return false;
  }
  // No MX: mail goes to the domain's own address, if it has one.
  for (const fn of [resolver.resolve4, resolver.resolve6]) {
    try {
      if ((await withTimeout(fn.call(resolver, domain))).length) return true;
    } catch (err) {
      if (!NO_DOMAIN.has(code(err))) return true;
    }
  }
  return false;
}

export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (!domain) return false;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const ok = await lookup(domain);
  cache.set(domain, { at: Date.now(), ok });
  return ok;
}

// Registration: a clear field error for a domain that cannot receive email.
export async function assertEmailDomainAcceptsMail(email: string) {
  if (!enabled || (await emailDomainAcceptsMail(email))) return;
  throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'email', message: 'This email address cannot receive email. Check the part after @ for typos (for example gmail.com).' }]);
}
