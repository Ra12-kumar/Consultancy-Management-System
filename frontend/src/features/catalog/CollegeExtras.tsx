import { Badge, Card } from "@/components/ui/Feedback";
import { safeHref } from "@/lib/safeUrl";
import type { CollegeDetail, CourseMode, PublicOffering, SocialLinks } from "@/types/catalog";

export const MODE_LABELS: Record<CourseMode, string> = {
  offline: "On campus",
  online: "Online",
  hybrid: "Hybrid",
};
export const QUALIFICATION_LABELS: Record<string, string> = {
  class_10: "Class 10",
  class_12: "Class 12",
  diploma: "Diploma",
  undergraduate: "Undergraduate degree",
  postgraduate: "Postgraduate degree",
  other: "Other",
};
const SOCIAL_NAMES: Record<keyof SocialLinks, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
};
// Our own uploaded files are served from these paths; anything else must be an https address.
const ownFile = (u: string | null | undefined) => (u && /^\/api\/colleges\/(images|brochures)\/[a-f0-9]{24}$/.test(u) ? u : null);

// Mode, minimum qualification, description, picture and brochure of one course at a college.
export function CourseExtras({ o }: { o: PublicOffering }) {
  const image = ownFile(o.imageUrl);
  const brochure = ownFile(o.brochureUrl);
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap gap-2">
        <Badge>{MODE_LABELS[o.mode ?? "offline"]}</Badge>
        {o.minQualification && <Badge>Minimum: {QUALIFICATION_LABELS[o.minQualification] ?? o.minQualification}</Badge>}
      </p>
      {(image || o.description) && (
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own uploaded course picture */}
          {image && <img src={image} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
          {o.description && <p className="whitespace-pre-line">{o.description}</p>}
        </div>
      )}
      {brochure && (
        <a href={brochure} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 font-semibold hover:bg-surface-2">
          Course brochure (PDF)
        </a>
      )}
    </div>
  );
}

// Brochure, admission information and the college's official social media pages.
export function CollegeLinks({ c }: { c: CollegeDetail }) {
  const brochure = ownFile(c.brochureUrl);
  const social = Object.entries(c.social ?? {})
    .map(([k, v]) => [k as keyof SocialLinks, safeHref(v)] as const)
    .filter(([, href]) => href && href.startsWith("https://"));
  if (!brochure && !c.admissionInfo && !social.length) return null;
  return (
    <Card>
      {c.admissionInfo && (
        <>
          <h2 className="font-semibold">Admission information</h2>
          <p className="mt-2 text-sm whitespace-pre-line">{c.admissionInfo}</p>
        </>
      )}
      {brochure && (
        <a href={brochure} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90">
          Download brochure (PDF)
        </a>
      )}
      {social.length > 0 && (
        <>
          <h2 className="mt-4 font-semibold">Official pages</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {social.map(([k, href]) => (
              <li key={k}>
                <a href={href!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-10 items-center rounded-full px-3 ring-1 ring-line hover:bg-surface-2">
                  {SOCIAL_NAMES[k]}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
