"use client";

import Link from "next/link";
import { useApiData } from "@/hooks/useApiData";
import { COURSE_LEVELS, durationLabel } from "@/lib/format";
import { apiGet } from "@/services/api";
import type { Course } from "@/types/catalog";
import { LoadState } from "@/features/admin/shared";

// The course catalogue grouped by level; each course links to the filtered college directory.
export default function CoursesCatalog() {
  const courses = useApiData((signal) => apiGet<Course[]>("/courses", { signal }), []);
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Courses</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Find your course</h1>
      <p className="mt-2 max-w-2xl text-muted">Choose a course to see the colleges that offer it, with eligibility and published fees.</p>
      <div className="mt-8">
        {!courses.data ? (
          <LoadState status={courses.status} error={courses.error} reload={courses.reload} rows={4} />
        ) : (
          <div className="space-y-8">
            {Object.entries(COURSE_LEVELS).map(([level, label]) => {
              const list = courses.data!.filter((c) => c.level === level);
              if (!list.length) return null;
              return (
                <section key={level} aria-labelledby={`level-${level}`}>
                  <h2 id={`level-${level}`} className="text-lg font-bold">
                    {label}
                  </h2>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((c) => (
                      <li key={c.id}>
                        <Link href={`/colleges?course=${c.slug}`} className="flex min-h-20 flex-col justify-center rounded-xl border border-line bg-surface p-4 hover:border-accent">
                          <span className="font-semibold">{c.name}</span>
                          <span className="text-sm text-muted">
                            {[c.category, c.typicalDurationMonths ? `typically ${durationLabel(c.typicalDurationMonths)}` : ""].filter(Boolean).join(" · ")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
