// Second line of defence for outbound links and images (the API already sends only safe absolute URLs).
// Returns the URL only when it is absolute http(s) with a real host; never builds or guesses one.
export function safeHref(value: string | null | undefined, { httpsOnly = false }: { httpsOnly?: boolean } = {}): string | null {
  if (!value || /\s/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
