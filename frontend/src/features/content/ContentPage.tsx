"use client";

import SocialLinks from "./SocialLinks";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { SafeMarkdown } from "@/lib/markdown";
import { apiGet } from "@/services/api";

export type Page = { slug: string; title: string; intro: string; body: string; faqs: Array<{ question: string; answer: string }>; updatedAt: string | null };
export type SiteInfo = { organisation: { name: string; supportEmail: string; supportPhone: string; whatsapp: string; address: string; officeHours: string; instagram?: string; facebook?: string }; banners: Array<{ id: string; title: string; body: string }>; payments: { enabled: boolean } };

type Fallback = { eyebrow: string; title: string; intro: string; points: string[] };

// A public page an admin can edit (Admin → Website content). Until it has been edited, the built-in text is shown.
export default function ContentPage({ slug, fallback, children }: { slug: string; fallback: Fallback; children?: ReactNode }) {
  const page = useApiData((signal) => apiGet<Page>(`/pages/${slug}`, { signal }).catch((e: { status?: number }) => (e?.status === 404 ? null : Promise.reject(e))), [slug]);
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">{fallback.eyebrow}</p>
      {page.status === "loading" && page.data === undefined ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      ) : page.data ? (
        <>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{page.data.title}</h1>
          {page.data.intro && <p className="mt-3 text-lg text-muted">{page.data.intro}</p>}
          {page.data.body && (
            <div className="mt-8">
              <SafeMarkdown text={page.data.body} />
            </div>
          )}
          {page.data.faqs.length > 0 && (
            <div className="mt-8 space-y-3">
              {page.data.faqs.map((f) => (
                <details key={f.question} className="rounded-2xl border border-line bg-surface p-4">
                  <summary className="cursor-pointer font-semibold">{f.question}</summary>
                  <div className="mt-2 text-sm">
                    <SafeMarkdown text={f.answer} />
                  </div>
                </details>
              ))}
            </div>
          )}
          {page.data.updatedAt && <p className="mt-10 text-xs text-muted">Last updated {new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(page.data.updatedAt))}</p>}
        </>
      ) : (
        <>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{fallback.title}</h1>
          <p className="mt-3 max-w-2xl text-muted">{fallback.intro}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {fallback.points.map((p) => (
              <li key={p} className="rounded-xl border border-line bg-surface p-4 text-sm">
                {p}
              </li>
            ))}
          </ul>
        </>
      )}
      {children}
      <div className="mt-10">
        <ButtonLink href="/enquire" variant="gold">
          Enquire for admission
        </ButtonLink>
      </div>
    </main>
  );
}

// Contact details managed under Admin → Site settings.
export function ContactDetails() {
  const site = useApiData((signal) => apiGet<SiteInfo>("/site", { signal }), []);
  const o = site.data?.organisation;
  if (!o || !(o.supportPhone || o.supportEmail || o.address || o.whatsapp || o.instagram || o.facebook)) return null;
  return (
    <>
    <dl className="mt-8 grid gap-3 rounded-2xl border border-line bg-surface p-5 text-sm sm:grid-cols-2">
      {o.supportPhone && (
        <div>
          <dt className="text-muted">Phone</dt>
          <dd>
            <a href={`tel:${o.supportPhone.replace(/\s/g, "")}`} className="font-semibold underline">
              {o.supportPhone}
            </a>
          </dd>
        </div>
      )}
      {o.whatsapp && (
        <div>
          <dt className="text-muted">WhatsApp</dt>
          <dd>
            <a href={`https://wa.me/${o.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              {o.whatsapp}
            </a>
          </dd>
        </div>
      )}
      {o.supportEmail && (
        <div>
          <dt className="text-muted">Email</dt>
          <dd>
            <a href={`mailto:${o.supportEmail}`} className="font-semibold underline">
              {o.supportEmail}
            </a>
          </dd>
        </div>
      )}
      {o.officeHours && (
        <div>
          <dt className="text-muted">Office hours</dt>
          <dd>{o.officeHours}</dd>
        </div>
      )}
      {o.address && (
        <div className="sm:col-span-2">
          <dt className="text-muted">Address</dt>
          <dd className="whitespace-pre-line">{o.address}</dd>
        </div>
      )}
    </dl>
    <SocialLinks />
    </>
  );
}

// Site-wide banners (Admin → Announcements, audience "Website banner").
export function SiteBanners() {
  const site = useApiData((signal) => apiGet<SiteInfo>("/site", { signal }).catch(() => null), []);
  const banners = site.data?.banners ?? [];
  if (!banners.length) return null;
  return (
    <div role="region" aria-label="Announcements" className="bg-accent/15">
      {banners.map((b) => (
        <p key={b.id} className="mx-auto max-w-7xl px-4 py-2 text-sm sm:px-6">
          <strong>{b.title}</strong> – {b.body}
        </p>
      ))}
    </div>
  );
}
