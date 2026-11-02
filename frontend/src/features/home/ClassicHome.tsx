// The previous home page, kept unrouted so it can be restored; "/" now shows the Udaan landing page.
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import CampusIllustration from "@/features/home/CampusIllustration";
import HeroSearch from "@/features/home/HeroSearch";
import HealthStatus from "@/features/health/HealthStatus";
import HomeLive from "@/features/home/HomeLive";

const COURSES = ["B.Tech / B.E.", "MBA / PGDM", "B.Sc.", "B.Com.", "BBA", "BCA", "B.Pharm", "LLB", "M.Tech / M.E.", "MCA", "M.Sc.", "Ph.D."];
const DESTINATIONS = [
  { name: "Delhi NCR", note: "Delhi, Noida, Greater Noida, Gurugram" },
  { name: "Bengaluru", note: "Karnataka" },
  { name: "Chennai", note: "Tamil Nadu" },
  { name: "Hyderabad", note: "Telangana" },
  { name: "Pune", note: "Maharashtra" },
  { name: "Mumbai", note: "Maharashtra" },
  { name: "Kolkata", note: "West Bengal" },
  { name: "South India", note: "Karnataka, Kerala, Tamil Nadu, Telangana, Andhra Pradesh" },
];
const STEPS = [
  ["Create your profile", "Register, verify your email and add your academic details."],
  ["Explore and compare", "Search colleges and courses and compare published fees side by side."],
  ["Talk to a counsellor", "Submit an enquiry and get guidance on eligibility, deadlines and scholarships."],
  ["Apply with confidence", "Track every step of your application from your dashboard."],
];
const WHY = [
  ["Transparent fees", "Official college fees and our consultancy charges are always shown separately."],
  ["Personal counselling", "Advice based on your marks, budget, preferred location and goals."],
  ["Scholarship guidance", "See preliminary eligibility and how to apply, without false promises."],
  ["Clear progress", "Every enquiry has a reference number and a visible status."],
];
const FAQ = [
  ["Do you guarantee admission?", "No. Admission decisions are made by colleges. We help you choose suitable options, prepare applications and track them."],
  ["Are the fees on this site official?", "Each published fee shows its source and when it was last verified. Our service charges are listed separately."],
  ["How is scholarship eligibility decided?", "We show preliminary eligibility from the criteria published for each scholarship. The final decision belongs to the scholarship provider."],
];

export default function ClassicHome() {
  return (
    <main id="main" className="flex-1">
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-navy text-white">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.25),transparent_55%),linear-gradient(180deg,#0b1f44_0%,#0e2a5c_100%)]" />
        <CampusIllustration className="absolute inset-x-0 bottom-0 -z-10 h-48 w-full sm:h-64" />
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-28 sm:px-6 sm:pt-24 sm:pb-36">
          <p className="text-sm font-semibold tracking-widest text-gold uppercase">Higher-education admissions across India</p>
          <h1 id="hero-title" className="mt-3 max-w-3xl text-4xl leading-tight font-bold tracking-tight sm:text-6xl">
            Your Future Begins With the Right College.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80">Explore courses, compare colleges, discover scholarships, and plan your higher education with expert guidance.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/colleges" variant="gold" size="lg">
              Explore Colleges
            </ButtonLink>
            <ButtonLink href="/enquire?source=home" size="lg" className="border border-white/40 bg-white/10 text-white hover:bg-white/20">
              Enquire for Admission
            </ButtonLink>
          </div>
        </div>
      </section>
      <div className="relative z-10 mx-auto -mt-16 max-w-5xl px-4 sm:px-6">
        <HeroSearch />
      </div>

      {/* Popular courses */}
      <section aria-labelledby="courses-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 id="courses-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Popular courses</h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COURSES.map((c) => (
            <li key={c}>
              <Link href={`/colleges?q=${encodeURIComponent(c)}`} className="flex min-h-16 items-center justify-center rounded-2xl border border-line bg-surface px-3 text-center text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-accent">
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Destinations */}
      <section aria-labelledby="dest-title" className="bg-surface-2 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 id="dest-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Study destinations across India</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DESTINATIONS.map((d) => (
              <li key={d.name}>
                <Link href={`/colleges?location=${encodeURIComponent(d.name)}`} className="group block h-full overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5">
                  <span className="block text-lg font-semibold">{d.name}</span>
                  <span className="mt-1 block text-sm text-white/70">{d.note}</span>
                  <span className="mt-4 inline-block text-sm font-semibold text-gold group-hover:underline">View colleges →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 id="how-title" className="text-2xl font-bold tracking-tight sm:text-3xl">How the admission process works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent font-bold text-accent-fg">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why us */}
      <section aria-labelledby="why-title" className="bg-navy py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 id="why-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Why students choose our guidance</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map(([t, d]) => (
              <li key={t} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <h3 className="font-semibold text-gold">{t}</h3>
                <p className="mt-1 text-sm text-white/75">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Live: featured colleges, open scholarships, approved testimonials */}
      <HomeLive />

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h2 id="faq-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <summary className="cursor-pointer list-none font-semibold">
                {q}
                <span aria-hidden="true" className="float-right text-accent-text group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-sm">
          <Link href="/faq" className="font-semibold text-accent-text hover:underline">
            More questions and answers →
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto mb-16 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-r from-navy to-[#14306b] p-8 text-white shadow-xl sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-bold">Ready to plan your admission?</h2>
            <p className="mt-1 text-white/75">Create your free student account and talk to a counsellor.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/register" variant="gold" size="lg">
              Create my account
            </ButtonLink>
            <ButtonLink href="/enquire" size="lg" className="border border-white/40 bg-white/10 text-white hover:bg-white/20">
              Enquire for Admission
            </ButtonLink>
          </div>
        </div>
        <div className="mt-8">
          <HealthStatus />
        </div>
      </section>
    </main>
  );
}
