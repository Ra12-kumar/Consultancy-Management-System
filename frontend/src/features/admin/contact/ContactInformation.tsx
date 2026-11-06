"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Card } from "@/components/ui/Feedback";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { LoadState, PageTitle } from "@/features/admin/shared";
import type { SiteInfo } from "@/features/content/ContentPage";
import { announceSiteInfoUpdate } from "@/features/content/FooterContact";
import { useApiData } from "@/hooks/useApiData";
import { apiGet, apiPut, fieldErrors } from "@/services/api";
import type { ApiError } from "@/types/api";

// Admin → Contact information: the company's contact details shown in the website footers' "Contact us" section.
// Saved in the site settings document (MongoDB) through the existing /admin/settings/site API, which validates
// every field again; the same details also appear on Site settings.

type Org = SiteInfo["organisation"];
type Key = "name" | "contactPerson" | "supportEmail" | "supportPhone" | "whatsapp" | "address" | "mapsUrl" | "officeHours" | "instagram" | "facebook" | "linkedin" | "youtube" | "x";
const KEYS: Key[] = ["name", "contactPerson", "supportEmail", "supportPhone", "whatsapp", "address", "mapsUrl", "officeHours", "instagram", "facebook", "linkedin", "youtube", "x"];
const LIMITS: Record<Key, number> = { name: 120, contactPerson: 120, supportEmail: 254, supportPhone: 30, whatsapp: 30, address: 400, mapsUrl: 500, officeHours: 200, instagram: 300, facebook: 300, linkedin: 300, youtube: 300, x: 300 };
const SOCIAL: Array<[Key, string, string[]]> = [
  ["instagram", "Instagram", ["instagram.com"]],
  ["facebook", "Facebook", ["facebook.com", "fb.com"]],
  ["linkedin", "LinkedIn", ["linkedin.com"]],
  ["youtube", "YouTube", ["youtube.com", "youtu.be"]],
  ["x", "X (Twitter)", ["x.com", "twitter.com"]],
];

const PHONE = /^\+?[0-9][0-9 ()-]{5,24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function host(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? { host: u.hostname.toLowerCase().replace(/^(www\.|m\.)/, ""), path: u.pathname } : null;
  } catch {
    return null;
  }
}
const isMaps = (v: string) => {
  const h = host(v);
  if (!h) return false;
  if (/^maps\.google\.[a-z.]+$/.test(h.host) || h.host === "maps.app.goo.gl") return true;
  return (/^google\.[a-z.]+$/.test(h.host) || h.host === "goo.gl") && h.path.startsWith("/maps");
};

// Same rules as the server, so mistakes show before saving.
export function validateContact(v: Record<Key, string>): Partial<Record<Key, string>> {
  const e: Partial<Record<Key, string>> = {};
  for (const k of KEYS) if (v[k].trim().length > LIMITS[k]) e[k] = `Use at most ${LIMITS[k]} characters`;
  if (v.supportEmail.trim() && !EMAIL.test(v.supportEmail.trim())) e.supportEmail = "Enter a valid email address";
  for (const k of ["supportPhone", "whatsapp"] as const) if (v[k].trim() && !PHONE.test(v[k].trim())) e[k] = "Use a phone number such as +91 98765 43210";
  if (v.mapsUrl.trim() && !isMaps(v.mapsUrl.trim())) e.mapsUrl = "Use the full https:// Google Maps link (Share → Copy link in Google Maps)";
  for (const [k, label, hosts] of SOCIAL) {
    const h = v[k].trim() && host(v[k].trim());
    if (v[k].trim() && (!h || !hosts.includes(h.host))) e[k] = `Use the full https:// address of the official ${label} page`;
  }
  return e;
}

const fromOrg = (o: Org | undefined): Record<Key, string> => Object.fromEntries(KEYS.map((k) => [k, (o?.[k] as string | undefined) ?? ""])) as Record<Key, string>;

export default function ContactInformation() {
  const settings = useApiData((signal) => apiGet<{ organisation: Org; updatedAt?: string | null }>("/admin/settings/site", { signal }), []);
  const [draft, setDraft] = useState<Record<Key, string> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const v = draft ?? (settings.data ? fromOrg(settings.data.organisation) : null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!v) return;
    const trimmed = Object.fromEntries(KEYS.map((k) => [k, v[k].trim()])) as Record<Key, string>;
    const problems = validateContact(trimmed);
    setErrors(problems);
    setFlash(null);
    if (Object.keys(problems).length) {
      setFlash({ tone: "error", text: "Please correct the highlighted fields." });
      return;
    }
    setBusy(true);
    try {
      await apiPut("/admin/settings/site", { organisation: trimmed });
      setDraft(null);
      settings.reload();
      // The website footers (this tab and other open tabs) show the new details right away.
      announceSiteInfoUpdate();
      setFlash({ tone: "success", text: "Saved. The website's Contact us section and footer now show these details." });
    } catch (err) {
      const fe = Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, m]) => [k.replace(/^organisation\./, ""), m]));
      setErrors(fe as Partial<Record<Key, string>>);
      setFlash({ tone: "error", text: (err as ApiError)?.message ?? "Could not save. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const field = (k: Key, label: string, extra: Record<string, unknown> = {}) => (
    <TextField
      label={label}
      value={v?.[k] ?? ""}
      onChange={(e) => {
        setDraft({ ...v!, [k]: e.target.value });
        if (errors[k]) setErrors({ ...errors, [k]: undefined });
      }}
      error={errors[k]}
      maxLength={LIMITS[k]}
      {...extra}
    />
  );

  return (
    <div className="space-y-6">
      <PageTitle title="Contact information" subtitle="Company contact details shown in the website's Contact us section and footer. Leave a field empty to hide it." />
      {!v ? (
        <Card>
          <LoadState status={settings.status} error={settings.error} reload={settings.reload} rows={4} />
        </Card>
      ) : (
        <form onSubmit={save} noValidate className="space-y-6">
          <Card>
            <h2 className="font-semibold">Company and contact person</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {field("name", "Company name", { autoComplete: "organization" })}
              {field("contactPerson", "Contact person", { autoComplete: "name" })}
              {field("supportEmail", "Email", { type: "email", autoComplete: "email", placeholder: "info@example.com" })}
              {field("supportPhone", "Phone", { type: "tel", autoComplete: "tel", placeholder: "+91 98765 43210" })}
              {field("whatsapp", "WhatsApp number", { type: "tel", placeholder: "+91 98765 43210", hint: "Visitors can open a WhatsApp chat with this number." })}
            </div>
          </Card>
          <Card>
            <h2 className="font-semibold">Office</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextAreaField
                  label="Office address"
                  value={v.address}
                  onChange={(e) => setDraft({ ...v, address: e.target.value })}
                  error={errors.address}
                  maxLength={LIMITS.address}
                  rows={3}
                />
              </div>
              {field("mapsUrl", "Google Maps location link", { type: "url", placeholder: "https://maps.app.goo.gl/…", hint: "In Google Maps: Share → Copy link." })}
              <TextAreaField
                label="Business hours"
                value={v.officeHours}
                onChange={(e) => setDraft({ ...v, officeHours: e.target.value })}
                error={errors.officeHours}
                maxLength={LIMITS.officeHours}
                rows={2}
                placeholder="Mon–Sat, 10:00 am – 6:00 pm"
              />
            </div>
          </Card>
          <Card>
            <h2 className="font-semibold">Social media</h2>
            <p className="mt-1 text-sm text-muted">Full https:// addresses of the official pages.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {SOCIAL.map(([k, label]) => (
                <div key={k}>{field(k, label, { type: "url", placeholder: `https://${k === "x" ? "x" : k}.com/…` })}</div>
              ))}
            </div>
          </Card>
          {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save contact information"}
            </Button>
            {draft && (
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(null);
                  setErrors({});
                  setFlash(null);
                }}
              >
                Discard changes
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
