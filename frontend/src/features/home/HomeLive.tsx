"use client";

import Link from "next/link";
import { CollegeCard } from "@/features/catalog/CatalogUi";
import { ScholarshipCard } from "@/features/scholarships/Scholarships";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { CollegeCard as Card } from "@/types/catalog";
import type { Scholarship } from "@/types/scholarship";

type Testimonial = { id: string; rating: number; quote: string; name: string };

// Live content for the home page. Each part hides itself when there is nothing published, so the page never shows
// empty or invented content. Testimonials are only consented, admin-approved student feedback.
export default function HomeLive() {
  const data = useApiData(async (signal) => {
    const [colleges, scholarships, testimonials] = await Promise.all([
      apiGet<Card[]>("/colleges?sort=featured&limit=3", { signal }).catch(() => [] as Card[]),
      apiGet<Scholarship[]>("/scholarships?open=yes&limit=3", { signal }).catch(() => [] as Scholarship[]),
      apiGet<Testimonial[]>("/testimonials", { signal }).catch(() => [] as Testimonial[]),
    ]);
    return { colleges, scholarships, testimonials };
  }, []);
  if (!data.data) return null;
  const { colleges, scholarships, testimonials } = data.data;
  return (
    <>
      {colleges.length > 0 && (
        <section aria-labelledby="featured-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="featured-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Featured colleges
            </h2>
            <Link href="/colleges" className="text-sm font-semibold text-accent-text hover:underline">
              Explore all colleges →
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {colleges.map((c) => (
              <CollegeCard key={c.id} college={c} />
            ))}
          </div>
        </section>
      )}
      {scholarships.length > 0 && (
        <section aria-labelledby="scholarships-title" className="bg-surface-2 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="scholarships-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
                Scholarships open now
              </h2>
              <Link href="/scholarships" className="text-sm font-semibold text-accent-text hover:underline">
                Check your eligibility →
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {scholarships.map((s) => (
                <ScholarshipCard key={s.id} s={s} />
              ))}
            </div>
          </div>
        </section>
      )}
      {testimonials.length > 0 && (
        <section aria-labelledby="testimonials-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 id="testimonials-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            What students say
          </h2>
          <p className="mt-1 text-sm text-muted">Shared by students who agreed to publish their feedback.</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <li key={t.id}>
                <figure className="h-full rounded-2xl border border-line bg-surface p-5">
                  <p className="text-accent" aria-label={`${t.rating} out of 5`}>
                    {"★".repeat(t.rating)}
                  </p>
                  <blockquote className="mt-2 text-sm">“{t.quote}”</blockquote>
                  <figcaption className="mt-3 text-sm font-semibold">{t.name}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
