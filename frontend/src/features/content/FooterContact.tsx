"use client";

import { useEffect, useId, type ReactNode } from "react";
import { useApiData } from "@/hooks/useApiData";
import { safeHref } from "@/lib/safeUrl";
import { waHref } from "@/lib/whatsapp";
import { apiGet } from "@/services/api";
import type { SiteInfo } from "./ContentPage";

// "Contact us" block for the website footers, filled from Admin → Contact information (GET /api/site). Nothing is
// written in the code: when no details are saved the block is not shown at all.

export const SITE_INFO_EVENT = "udaan:site-info-updated";
const CHANNEL = "udaan-site-info";

// Called after an admin saves: footers in this tab and in other open tabs fetch the details again.
export function announceSiteInfoUpdate() {
  window.dispatchEvent(new Event(SITE_INFO_EVENT));
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage("updated");
    ch.close();
  } catch {
    // BroadcastChannel is unavailable in some browsers: the other tabs update on their next page load.
  }
}

function useSiteInfo() {
  const site = useApiData((signal) => apiGet<SiteInfo>("/site", { signal }).catch(() => null), []);
  const { reload } = site;
  useEffect(() => {
    window.addEventListener(SITE_INFO_EVENT, reload);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = reload;
    } catch {
      ch = null;
    }
    return () => {
      window.removeEventListener(SITE_INFO_EVENT, reload);
      ch?.close();
    };
  }, [reload]);
  return site.data?.organisation;
}

const https = (u: string | undefined) => {
  const h = safeHref(u);
  return h && h.startsWith("https://") ? h : null;
};

const SOCIAL: Array<[keyof SiteInfo["organisation"], string]> = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
  ["x", "X (Twitter)"],
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide uppercase opacity-70">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

// tone "navy": the shared site footer; tone "udaan": the home page footer. `social` lists the networks to show
// (the shared footer already shows Instagram, Facebook and WhatsApp buttons, so it passes only the others).
export default function FooterContact({ social = SOCIAL.map(([k]) => k), className = "" }: { social?: Array<keyof SiteInfo["organisation"]>; className?: string }) {
  const o = useSiteInfo();
  const headingId = useId();
  if (!o) return null;
  const tel = o.supportPhone ? `tel:${o.supportPhone.replace(/[^\d+]/g, "")}` : null;
  const wa = waHref(o.whatsapp);
  const maps = https(o.mapsUrl);
  const links = SOCIAL.filter(([k]) => social.includes(k)).flatMap(([k, label]) => {
    const href = https(o[k] as string | undefined);
    return href ? [[label, href] as const] : [];
  });
  const has = o.name || o.contactPerson || tel || wa || o.supportEmail || o.address || o.officeHours || maps || links.length;
  if (!has) return null;
  const link = "underline-offset-2 hover:text-white hover:underline";
  return (
    <section aria-labelledby={headingId} className={className} data-footer-contact="">
      <h2 id={headingId} className="text-sm font-semibold text-white">
        Contact us
      </h2>
      <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {(o.name || o.contactPerson) && (
          <Row label={o.name ? "Company" : "Contact person"}>
            {o.name && <p className="font-semibold text-white">{o.name}</p>}
            {o.name && o.contactPerson && <p>Contact: {o.contactPerson}</p>}
            {!o.name && <p>{o.contactPerson}</p>}
          </Row>
        )}
        {(tel || wa || o.supportEmail) && (
          <Row label="Phone and email">
            {tel && (
              <p>
                <a href={tel} className={link}>
                  {o.supportPhone}
                </a>
              </p>
            )}
            {wa && (
              <p>
                <a href={wa} target="_blank" rel="noopener noreferrer" className={link}>
                  WhatsApp {o.whatsapp}
                  <span className="sr-only"> (opens WhatsApp in a new tab)</span>
                </a>
              </p>
            )}
            {o.supportEmail && (
              <p>
                <a href={`mailto:${o.supportEmail}`} className={`${link} break-all`}>
                  {o.supportEmail}
                </a>
              </p>
            )}
          </Row>
        )}
        {(o.address || maps) && (
          <Row label="Office">
            {o.address && <p className="whitespace-pre-line">{o.address}</p>}
            {maps && (
              <p>
                <a href={maps} target="_blank" rel="noopener noreferrer" className={`${link} font-semibold`}>
                  View on Google Maps ↗<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            )}
          </Row>
        )}
        {(o.officeHours || links.length > 0) && (
          <Row label={o.officeHours ? "Business hours" : "Follow us"}>
            {o.officeHours && <p className="whitespace-pre-line">{o.officeHours}</p>}
            {links.length > 0 && (
              <ul className={`flex flex-wrap gap-x-3 gap-y-1 ${o.officeHours ? "mt-2" : ""}`} aria-label="Social media">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
                      {label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        )}
      </dl>
    </section>
  );
}
