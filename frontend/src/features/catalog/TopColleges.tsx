import { ButtonLink } from "@/components/ui/Button";

// Well-known institutions from the top 10 of the Government of India's NIRF India Rankings 2024 (Overall).
// Websites are the "official website" listed on Wikidata; photos are freely licensed files from Wikimedia
// Commons, stored locally in /public/images/colleges and credited as their licences require.
type Top = { name: string; city: string; state: string; website: string; image: string; credit: { author: string; license: string; page: string } };

export const TOP_COLLEGES: Top[] = [
  { name: "Indian Institute of Technology Madras", city: "Chennai", state: "Tamil Nadu", website: "https://www.iitm.ac.in/", image: "/images/colleges/iit-madras.jpg", credit: { author: "Mzwirlein", license: "CC0", page: "https://commons.wikimedia.org/wiki/File:IITMmensa.jpg" } },
  { name: "Indian Institute of Science", city: "Bengaluru", state: "Karnataka", website: "https://www.iisc.ac.in/", image: "/images/colleges/iisc-bengaluru.jpg", credit: { author: "Sheeju Chandran", license: "Public domain", page: "https://commons.wikimedia.org/wiki/File:Sheeju_iisc.jpg" } },
  { name: "Indian Institute of Technology Bombay", city: "Mumbai", state: "Maharashtra", website: "https://www.iitb.ac.in/", image: "/images/colleges/iit-bombay.jpg", credit: { author: "Arne Hückelheim", license: "CC BY-SA 3.0", page: "https://commons.wikimedia.org/wiki/File:IITBMainBuildingCROP.jpg" } },
  { name: "Indian Institute of Technology Delhi", city: "New Delhi", state: "Delhi", website: "https://www.iitd.ac.in/", image: "/images/colleges/iit-delhi.jpg", credit: { author: "Nithinmohan", license: "CC BY-SA 3.0", page: "https://commons.wikimedia.org/wiki/File:IIT_Delhi.JPG" } },
  { name: "Indian Institute of Technology Kanpur", city: "Kanpur", state: "Uttar Pradesh", website: "https://www.iitk.ac.in/", image: "/images/colleges/iit-kanpur.jpg", credit: { author: "AmarChandra", license: "CC BY-SA 3.0", page: "https://commons.wikimedia.org/wiki/File:IITKLibrary.jpg" } },
  { name: "Indian Institute of Technology Kharagpur", city: "Kharagpur", state: "West Bengal", website: "https://www.iitkgp.ac.in/", image: "/images/colleges/iit-kharagpur.jpg", credit: { author: "Shashwata Saha", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:INDIAN_INSTITUTE_OF_TECHNOLOGY,_Kharagpur.JPG" } },
  { name: "All India Institute of Medical Sciences, New Delhi", city: "New Delhi", state: "Delhi", website: "https://www.aiims.edu/", image: "/images/colleges/aiims-delhi.jpg", credit: { author: "Dr.saptarshi", license: "Public domain", page: "https://commons.wikimedia.org/wiki/File:AIIMS_central_lawn.jpg" } },
  { name: "Jawaharlal Nehru University", city: "New Delhi", state: "Delhi", website: "https://www.jnu.ac.in/", image: "/images/colleges/jnu-delhi.jpg", credit: { author: "गंगा सहाय मीणा", license: "CC BY-SA 3.0", page: "https://commons.wikimedia.org/wiki/File:JNU_Admin.JPG" } },
];

export default function TopColleges() {
  return (
    <section aria-labelledby="top-heading" className="mt-12">
      <h2 id="top-heading" className="text-2xl font-bold tracking-tight">
        India&apos;s best colleges
      </h2>
      <p className="mt-1 text-sm text-muted">
        Leading institutions from the top 10 of the{" "}
        <a href="https://www.nirfindia.org/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          NIRF India Rankings 2024
        </a>{" "}
        (Overall).
      </p>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {TOP_COLLEGES.map((c) => (
          <li key={c.name} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
            <figure className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local, already-sized photo */}
              <img src={c.image} alt={`Campus of ${c.name}`} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
              <figcaption className="absolute right-0 bottom-0 left-0 truncate bg-black/55 px-2 py-0.5 text-[10px] text-white/90">
                <a href={c.credit.page} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Photo: {c.credit.author}, {c.credit.license}, Wikimedia Commons
                </a>
              </figcaption>
            </figure>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-semibold leading-snug">{c.name}</h3>
              <p className="mt-0.5 text-sm text-muted">
                {c.city}, {c.state}
              </p>
              <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                <a href={c.website} target="_blank" rel="noopener noreferrer" className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
                  Visit official website <span aria-hidden="true">↗</span>
                  <span className="sr-only">for {c.name} (opens in a new tab)</span>
                </a>
                <ButtonLink href={`/enquire?collegeName=${encodeURIComponent(`${c.name}, ${c.city}`)}&source=top_colleges`} size="sm" variant="gold" className="col-span-2 text-center">
                  Enquire for Admission
                </ButtonLink>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
