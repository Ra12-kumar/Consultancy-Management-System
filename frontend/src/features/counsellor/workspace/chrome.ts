// Shared by the counsellor frame and its loading screen.
// The site header and footer are hidden here, and the counsellor area always uses the light colour tokens (the
// design is light; without this, shared components follow the device's dark mode and become unreadable on the
// light background).
export const counsellorChrome = `body:has(#counsellor-workspace) > header, body:has(#counsellor-workspace) > footer, body:has(#counsellor-workspace) > [aria-label="Announcements"] { display: none; }
#counsellor-workspace { color-scheme: light; --background: #f5f7fb; --foreground: #0b1f44; --surface: #ffffff; --surface-2: #eef2f9; --line: #dde3ee; --muted: #4a5672; --primary: #0b1f44; --primary-fg: #ffffff; --accent: #c9a227; --accent-fg: #0b1f44; --accent-text: #8a6d0f; --success: #15803d; --warning: #a16207; --danger: #b91c1c; --ring: #c9a227; }`;
