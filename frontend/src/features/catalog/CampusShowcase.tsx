import Link from "next/link";
import { TOP_COLLEGES } from "./TopColleges";

// Large campus photos of leading institutions (NIRF India Rankings 2024, Overall top 10), shown at the bottom
// of the colleges page. Same real, freely licensed Wikimedia Commons photos as the "India's best colleges"
// cards, each with its credit, official website and an enquiry link.
export default function CampusShowcase() {
  return (
    <section aria-labelledby="campus-heading" className="mt-14">
      <h2 id="campus-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
        Campus life at India&apos;s top institutions
      </h2>
      <p className="mt-1 text-sm text-muted">A closer look at some of the country&apos;s leading campuses.</p>
      <ul className="mt-6 grid gap-6 lg:grid-cols-2">
        {TOP_COLLEGES.map((c) => (
          <li key={c.name}>
            <figure className="group relative overflow-hidden rounded-3xl bg-navy shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element -- local, already-sized photo */}
              <img src={c.image} alt={`Campus of ${c.name}, ${c.city}`} loading="lazy" decoding="async" className="h-72 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-96" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                <p className="text-xl leading-snug font-bold sm:text-2xl">{c.name}</p>
                <p className="mt-1 text-sm text-white/85">
                  {c.city}, {c.state}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white px-4 text-sm font-semibold text-navy hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
                    Visit official website <span aria-hidden="true">↗</span>
                    <span className="sr-only">for {c.name} (opens in a new tab)</span>
                  </a>
                  <Link href={`/enquire?collegeName=${encodeURIComponent(`${c.name}, ${c.city}`)}&source=top_colleges`} className="inline-flex min-h-10 items-center rounded-xl bg-gold px-4 text-sm font-semibold text-navy hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                    Enquire for Admission
                  </Link>
                </div>
                <a href={c.credit.page} target="_blank" rel="noopener noreferrer" className="mt-3 block truncate text-[11px] text-white/70 hover:underline">
                  Photo: {c.credit.author}, {c.credit.license}, Wikimedia Commons
                </a>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
