"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Feedback";
import { safeHref } from "@/lib/safeUrl";
import type { CollegeDetail, GalleryImage } from "@/types/catalog";
import { AdmissionLine } from "./CatalogUi";

// The college's photo gallery: one large photo and thumbnails to switch between them.
export function PhotoGallery({ name, images }: { name: string; images: GalleryImage[] }) {
  const [i, setI] = useState(() => Math.max(0, images.findIndex((x) => x.primary)));
  if (images.length === 0) return null;
  const current = images[i] ?? images[0]!;
  return (
    <section aria-label={`Photos of ${name}`} className="mt-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- our own uploaded photo */}
      <img src={current.url} alt={current.alt || `Campus of ${name}`} className="aspect-[16/9] w-full rounded-2xl border border-line object-cover sm:aspect-[21/9]" />
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, j) => (
            <li key={img.id} className="shrink-0">
              <button type="button" onClick={() => setI(j)} aria-label={`Show photo ${j + 1}: ${img.alt || name}`} aria-pressed={j === i} className={`block overflow-hidden rounded-lg ring-2 ${j === i ? "ring-accent" : "ring-transparent hover:ring-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- our own uploaded photo */}
                <img src={img.url} alt="" className="h-16 w-24 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Admission details entered from the college's official sources. Missing items are said to be missing.
export function AdmissionDetails({ c }: { c: CollegeDetail }) {
  const apply = safeHref(c.applicationUrl);
  const has = c.eligibility || c.entranceExams?.length || c.academicSession || c.admissionDeadline || apply || c.facilities?.length || c.highlights?.length;
  if (!has) return null;
  return (
    <Card>
      <h2 className="font-semibold">Admission at a glance</h2>
      <AdmissionLine session={c.academicSession} deadline={c.admissionDeadline} />
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-muted">Eligibility</dt>
          <dd className="whitespace-pre-line">{c.eligibility || "Not published yet – ask our counsellors."}</dd>
        </div>
        <div>
          <dt className="text-muted">Entrance exams</dt>
          <dd>{c.entranceExams?.length ? c.entranceExams.join(", ") : "Not published yet"}</dd>
        </div>
        {c.facilities && c.facilities.length > 0 && (
          <div>
            <dt className="text-muted">Facilities</dt>
            <dd>{c.facilities.join(" · ")}</dd>
          </div>
        )}
        {c.highlights && c.highlights.length > 0 && (
          <div>
            <dt className="text-muted">Highlights</dt>
            <dd>
              <ul className="list-disc pl-5">
                {c.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      {apply && (
        <a href={apply} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2">
          Official application page <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </Card>
  );
}
