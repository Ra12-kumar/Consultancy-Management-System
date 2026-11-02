"use client";

import { useApiData } from "@/hooks/useApiData";
import { safeHref } from "@/lib/safeUrl";
import { waHref } from "@/lib/whatsapp";
import { apiGet } from "@/services/api";
import type { SiteInfo } from "./ContentPage";

// Instagram, Facebook and WhatsApp links set by admins under Site settings (shown only when set).
// The WhatsApp button opens a WhatsApp chat; it does not place a phone call.
const ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
      <path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8Z" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" />
    </svg>
  ),
};

export function socialLinksOf(o: SiteInfo["organisation"] | undefined) {
  if (!o) return [];
  const https = (u: string | undefined) => {
    const h = safeHref(u);
    return h && h.startsWith("https://") ? h : null;
  };
  return [
    ["instagram", "Instagram", https(o.instagram)],
    ["facebook", "Facebook", https(o.facebook)],
    ["whatsapp", "Chat on WhatsApp", waHref(o.whatsapp)],
  ].filter((x): x is [keyof typeof ICONS, string, string] => Boolean(x[2]));
}

export default function SocialLinks({ tone = "light" }: { tone?: "light" | "dark" }) {
  const site = useApiData((signal) => apiGet<SiteInfo>("/site", { signal }).catch(() => null), []);
  const links = socialLinksOf(site.data?.organisation);
  if (!links.length) return null;
  const style = tone === "dark" ? "bg-white/10 text-white hover:bg-white/20" : "bg-surface ring-1 ring-line hover:bg-surface-2";
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Follow and contact us">
      {links.map(([key, label, href]) => (
        <li key={key}>
          <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold ${style}`}>
            {ICONS[key]}
            <span>{label}</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
