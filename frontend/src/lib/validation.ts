// Client-side checks that mirror the server's rules (backend/src/validators/common.ts) for instant feedback.
// The server validates everything again; these never replace it.

export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 10) return "Use at least 10 characters";
  if (password.length > 128) return "Use at most 128 characters";
  if (!/[A-Za-z]/.test(password)) return "Include at least one letter";
  if (!/\d/.test(password)) return "Include at least one number";
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "Your password must not be your email address";
  return null;
}

export const emailProblem = (email: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter a valid email address");

export const nameProblem = (name: string) => (name.trim().length < 2 ? "Enter your full name" : /^[\p{L}\p{M} .'-]+$/u.test(name.trim()) ? null : "Use letters, spaces, dots, apostrophes or hyphens only");

// Indian mobile: 10 digits starting 6-9 (with or without +91), or any international number with +.
export function mobileProblem(mobile: string) {
  const digits = mobile.replace(/[\s-]/g, "");
  if (/^(\+91|91|0)?[6-9]\d{9}$/.test(digits) || /^\+[1-9]\d{7,14}$/.test(digits)) return null;
  return "Enter a valid mobile number";
}

// A safe in-site redirect target (never another site).
export const safeNext = (next: string | null, fallback: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
