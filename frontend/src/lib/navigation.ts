// A full page load (not a client-side route change). Used after signing in or out so nothing cached for the
// previous session is reused.
export function hardNavigate(url: string) {
  window.location.assign(url);
}
