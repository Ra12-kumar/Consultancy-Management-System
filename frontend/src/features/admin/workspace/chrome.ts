// Shared by the admin workspace frame and its loading screen: the public site header, footer and announcements are
// hidden inside the admin area.
export const adminChrome = `body:has(#admin-workspace) > header, body:has(#admin-workspace) > footer, body:has(#admin-workspace) > [aria-label="Announcements"] { display: none; }`;
