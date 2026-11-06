import { afterAll, describe, expect, it } from 'vitest';
import { checkWebsite, checkWebsites, setWebsiteChecker, verifiedWebsite } from '../src/services/websiteHealth.service.js';

// Fake websites: each address answers with a status, a final address (after redirects) and a page.
type Site = { status?: number; final?: string; html?: string; error?: string };
function fakeWeb(sites: Record<string, Site>) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const site = sites[url];
    if (!site || site.error) throw Object.assign(new TypeError('fetch failed'), { cause: { code: site?.error ?? 'ENOTFOUND' } });
    const res = new Response(site.html ?? '<html><title>College</title></html>', { status: site.status ?? 200, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'url', { value: site.final ?? url });
    return res;
  }) as typeof fetch;
}

afterAll(() => setWebsiteChecker(null));

describe('college website checks', () => {
  it('keeps working sites at their real final address and prefers https', async () => {
    setWebsiteChecker(fakeWeb({ 'https://www.college.ac.in/': { final: 'https://www.college.ac.in/home' }, 'https://old.edu/': { error: 'CERT_HAS_EXPIRED' }, 'http://old.edu/': { final: 'http://old.edu/' } }));
    expect(await checkWebsite('http://www.college.ac.in/')).toMatchObject({ ok: true, finalUrl: 'https://www.college.ac.in/home' });
    // The https form fails (bad certificate): the http link that works is kept.
    expect(await checkWebsite('http://old.edu/')).toMatchObject({ ok: true, finalUrl: 'http://old.edu/' });
  });

  it('marks missing domains, not-found pages, server errors and parked or suspended domains as broken', async () => {
    setWebsiteChecker(
      fakeWeb({
        'https://gone.example/': { error: 'ENOTFOUND' },
        'https://missing.example/': { status: 404 },
        'https://down.example/': { status: 503 },
        'https://forsale.example/': { html: '<h1>This domain is for sale!</h1>' },
        'https://parked.example/': { final: 'https://www.hugedomains.com/domain_profile.cfm?d=parked.example' },
        'https://suspended.example/': { html: '<title>Account Suspended</title>' },
        'https://blocked.example/': { status: 403 },
      }),
    );
    for (const url of ['https://gone.example/', 'https://missing.example/', 'https://down.example/', 'https://forsale.example/', 'https://parked.example/', 'https://suspended.example/']) {
      expect((await checkWebsite(url)).ok, url).toBe(false);
    }
    // Sites that refuse automated visitors still exist.
    expect(await checkWebsite('https://blocked.example/')).toMatchObject({ ok: true });
  });

  it('shows only verified links, never touches Galgotias colleges, and shows links as listed before any check', async () => {
    setWebsiteChecker(null, null);
    expect(verifiedWebsite('Any College', 'http://any.example/')).toBe('http://any.example/');

    setWebsiteChecker(fakeWeb({ 'https://good.example/': {}, 'https://bad.example/': { status: 404 } }), { checkedAt: new Date().toISOString(), results: {} });
    const summary = await checkWebsites([
      { name: 'Good College', website: 'https://good.example/' },
      { name: 'Bad College', website: 'https://bad.example/' },
      { name: "Galgotia's College of Engineering and Technology", website: 'https://galgotiacollege.edu/' },
      { name: 'No Website College', website: null },
    ]);
    expect(summary).toEqual({ checked: 2, working: 1, broken: 1 });
    expect(verifiedWebsite('Good College', 'https://good.example/')).toBe('https://good.example/');
    expect(verifiedWebsite('Bad College', 'https://bad.example/')).toBeNull();
    expect(verifiedWebsite('Unchecked College', 'https://new.example/')).toBeNull();
    expect(verifiedWebsite("Galgotia's College of Engineering and Technology", 'https://galgotiacollege.edu/')).toBe('https://galgotiacollege.edu/');
  });

  it('keeps unchecked links visible while the first run is unfinished, and resumes an interrupted run', async () => {
    const seen: string[] = [];
    const web = fakeWeb({ 'https://a.example/': {}, 'https://b.example/': {} });
    setWebsiteChecker(((u: string | URL | Request, init?: RequestInit) => (seen.push(String(u)), web(u, init))) as typeof fetch, {
      checkedAt: new Date().toISOString(),
      complete: false,
      results: { 'https://a.example/': { ok: true, finalUrl: 'https://a.example/', status: 200, reason: 'working', checkedAt: new Date().toISOString() } },
    });
    // Mid-run: an unchecked link is still shown as listed.
    expect(verifiedWebsite('B College', 'https://b.example/')).toBe('https://b.example/');
    const summary = await checkWebsites([
      { name: 'A College', website: 'https://a.example/' },
      { name: 'B College', website: 'https://b.example/' },
    ]);
    expect(summary).toEqual({ checked: 2, working: 2, broken: 0 });
    // Only the link not yet checked was opened.
    expect(seen).toEqual(['https://b.example/']);
  });
});
