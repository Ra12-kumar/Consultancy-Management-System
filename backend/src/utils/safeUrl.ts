// Output-side check for links and images shown to students. Only absolute http(s) URLs to a real host name are
// returned; anything else (javascript:, data:, relative paths, credentials, bare IPs, localhost) becomes null, so
// the page shows "Official website not available" instead of a broken or unsafe link. URLs are never invented.
export function safeExternalUrl(value: unknown, { httpsOnly = false }: { httpsOnly?: boolean } = {}): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 500 || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && (httpsOnly || url.protocol !== 'http:')) return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+)+$/.test(host) || host === 'localhost' || host.endsWith('.local')) return null;
  return url.toString();
}
