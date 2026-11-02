/* eslint-disable @next/next/no-img-element -- small local SVG icons from the client design */
import { Inter, Libre_Baskerville } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import UdanCallbackForm from "./UdanCallbackForm";
import UdanSearch from "./UdanSearch";

const sans = Inter({ subsets: ["latin"], variable: "--font-udan-sans" });
const serif = Libre_Baskerville({ subsets: ["latin"], weight: "400", variable: "--font-udan-serif" });

// Udaan landing page, built from the client's Figma design ("Udaan · Find your way forward"). Every action
// leads to a working part of the app: the college finder, course browser, sign-in, contact and the
// callback form (POST /api/leads/callback).

const COURSE_FAMILIES = [
  { icon: "cpu", field: "Engineering", degrees: "B.Tech · M.Tech", href: "/colleges?branch=engineering" },
  { icon: "briefcase-business", field: "Management", degrees: "BBA · MBA · PGDM", href: "/colleges?branch=management" },
  { icon: "stethoscope", field: "Medicine", degrees: "MBBS · BDS · Nursing", href: "/colleges?branch=medical" },
  { icon: "atom", field: "Arts & science", degrees: "BA · B.Sc · MA · M.Sc", href: "/colleges?branch=arts" },
  { icon: "scale", field: "Law", degrees: "LLB · BA LLB · LLM", href: "/colleges?branch=law" },
  { icon: "pen-tool", field: "Design", degrees: "B.Des · M.Des", href: "/colleges?branch=design" },
];
const POPULAR = [
  ["B.Tech", "/colleges?branch=engineering"],
  ["MBA", "/colleges?branch=management"],
  ["MBBS", "/colleges?branch=medical"],
  ["Bengaluru", "/colleges?q=Bengaluru"],
  ["Delhi NCR", "/colleges?state=Delhi"],
];
const DESTINATIONS = [
  { city: "Bengaluru", region: "Karnataka", image: "/udan/bengaluru.jpg", interests: "Technology · Management · Design", href: "/colleges?q=Bengaluru" },
  { city: "Pune", region: "Maharashtra", image: "/udan/pune.jpg", interests: "Engineering · Arts · Management", href: "/colleges?q=Pune" },
  { city: "Delhi NCR", region: "Delhi & surrounding region", image: "/udan/delhi-ncr.jpg", interests: "Law · Humanities · Commerce", href: "/colleges?state=Delhi" },
];
const SUPPORT = [
  ["A shortlist that makes sense", "Explore course fit, entry requirements, location and your family’s budget."],
  ["An application plan you can follow", "Organise entrance routes, deadlines and the documents you’ll need."],
  ["Support through the final decision", "Review your options and understand the next steps before you commit."],
];
const JOURNEY = [
  ["Tell us your story", "Share your interests, marks, preferred locations and budget.", "You bring: your goals"],
  ["Explore your options", "Build a shortlist and discuss eligibility, fees and entry routes.", "You get: a considered shortlist"],
  ["Prepare to apply", "Map deadlines, check documents and complete applications.", "You get: an application checklist"],
  ["Choose with clarity", "Review offers and confirm admission with the institution.", "You decide: your next chapter"],
];
// Guides point to pages that exist in the app today.
const GUIDES = [
  { icon: "notebook-tabs", category: "COLLEGE DECISIONS", title: "How to compare colleges beyond the brochure", summary: "A practical look at recognition, course fit, costs and campus life.", where: "Compare colleges", href: "/compare" },
  { icon: "wallet", category: "MONEY MATTERS", title: "Build a realistic college budget", summary: "Plan for tuition, accommodation and the costs that are easy to miss.", where: "Browse course fees", href: "/courses/browse" },
  { icon: "files", category: "APPLICATION ESSENTIALS", title: "Your admissions document checklist", summary: "Keep your marksheets, IDs and certificates ready before you apply.", where: "Admission process", href: "/admission-process" },
];
const FAQS = [
  ["What does counselling with Udaan cost?", "The scope of support and any charges will be explained before you choose a service. Ask your counsellor for a written breakdown, including what’s included and any applicable terms. College application and tuition fees are separate."],
  ["Can you guarantee admission to a college?", "No. Admission decisions rest with colleges and official counselling authorities. We help you understand eligibility, build a realistic shortlist and prepare strong applications, but no seat is guaranteed."],
  ["Can my parents join the counselling session?", "Yes. Parents and guardians are welcome in every conversation, and you can choose “Parent / guardian” when you request a callback."],
  ["Can I explore colleges that aren’t Udaan partners?", "Yes. The college finder lists institutions across India whether or not they work with us, and your counsellor will discuss any option that suits you."],
  ["What should I prepare for my first conversation?", "Your latest marks, any entrance exam scores, the courses and places you are considering, and a rough budget. It’s fine if you are not sure yet; that is what the conversation is for."],
];

const ink = "text-[#142b41]";
const muted = "text-[#5c6974]";
const gutter = "px-4 sm:px-8 xl:px-[88px]";
const eyebrow = "text-[11px] font-bold tracking-[1.8px]";
const display = "font-[family-name:var(--font-udan-serif)] tracking-[-1.1px]";

function Arrow({ file = "arrow-gold-btn", size = 18 }: { file?: string; size?: number }) {
  return <img src={`/udan/${file}.svg`} alt="" width={size} height={size} />;
}

function Action({ href, children, tone = "gold", arrow }: { href: string; children: ReactNode; tone?: "gold" | "navy"; arrow: string }) {
  const cls = tone === "gold" ? "bg-[#edbf54] text-[#142b41] hover:bg-[#e5b23d] focus-visible:ring-[#10283f]" : "bg-[#10283f] text-white hover:bg-[#1b3a57] focus-visible:ring-[#edbf54]";
  return (
    <Link href={href} className={`inline-flex h-[50px] items-center justify-center gap-4 rounded-md px-[22px] text-sm font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none ${cls}`}>
      {children}
      <Arrow file={arrow} />
    </Link>
  );
}

function Intro({ label, title, children, light = false, id }: { label: string; title: string; children?: ReactNode; light?: boolean; id?: string }) {
  return (
    <div className="space-y-4">
      <p className={`${eyebrow} ${light ? "text-[#edbf54]" : muted}`}>{label}</p>
      <h2 id={id} className={`${display} text-3xl leading-[1.3] sm:text-[38px] ${light ? "text-white" : ink}`}>
        {title}
      </h2>
      {children && <p className={`text-base leading-[1.65] ${light ? "text-[#c8d2da]" : muted}`}>{children}</p>}
    </div>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src={`/udan/${light ? "flight-mark-light" : "flight-mark"}.svg`} alt="" width={35} height={34} />
      <span className={`font-[family-name:var(--font-udan-sans)] text-[32px] font-bold tracking-[-1.3px] ${light ? "text-white" : "text-[#10283f]"}`}>udaan</span>
    </span>
  );
}

function Checks({ items, icon, tone }: { items: string[]; icon: string; tone: string }) {
  return (
    <ul className="space-y-3.5">
      {items.map((t) => (
        <li key={t} className={`flex items-start gap-3 text-sm leading-[1.5] ${tone}`}>
          <img src={`/udan/${icon}.svg`} alt="" width={18} height={18} className="mt-0.5 shrink-0" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function UdanLanding() {
  return (
    <div id="udan" className={`${sans.variable} ${serif.variable} bg-white font-[family-name:var(--font-udan-sans)] ${ink}`}>
      {/* This page brings its own header and footer, so the site-wide ones are hidden while it is open. */}
      <style>{`body:has(#udan) > header, body:has(#udan) > footer, body:has(#udan) > [aria-label="Announcements"] { display: none; }`}</style>

      {/* Audience bar and navigation */}
      <div className={`flex h-[34px] items-center justify-between bg-[#f7f5ef] text-[11px] ${gutter}`}>
        <p className={`hidden sm:block ${muted}`}>Education choices. Thoughtfully guided.</p>
        <nav aria-label="Audience" className="flex items-center gap-6">
          <a href="#guidance" className="font-semibold hover:underline">
            For students &amp; parents
          </a>
          <span aria-hidden="true" className="h-3 w-px bg-[#dfe3e5]" />
          <a href="#institutions" className="hover:underline">
            For institutions ↗
          </a>
        </nav>
      </div>
      <header className={`flex min-h-[88px] flex-wrap items-center justify-between gap-4 bg-white py-3 ${gutter}`}>
        <Link href="/" aria-label="Udaan home">
          <Brand />
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-6 overflow-x-auto text-sm font-medium lg:order-none lg:w-auto lg:gap-[30px]">
          <Link href="/colleges" className="whitespace-nowrap hover:underline">
            Find colleges
          </Link>
          <Link href="/courses" className="whitespace-nowrap hover:underline">
            Explore courses
          </Link>
          <a href="#counselling" className="whitespace-nowrap hover:underline">
            Counselling
          </a>
          <a href="#resources" className="whitespace-nowrap hover:underline">
            Resources
          </a>
        </nav>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-medium hover:underline">
            Sign in
          </Link>
          <Action href="#guidance" arrow="arrow-gold-btn">
            Get guidance
          </Action>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="udan-hero" className={`bg-[#10283f] pt-12 pb-10 ${gutter}`}>
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16">
            <div className="w-full space-y-[26px] lg:w-[620px] lg:shrink-0">
              <p className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[1.8px] text-[#edbf54]">
                <span aria-hidden="true" className="h-0.5 w-6 bg-[#edbf54]" />
                YOUR AMBITION. YOUR WAY FORWARD.
              </p>
              <h1 id="udan-hero" className="font-[family-name:var(--font-udan-serif)] text-[40px] leading-[1.2] tracking-[-2px] text-white sm:text-[52px] xl:text-[62px]">
                A clearer path to your <span className="text-[#edbf54]">next chapter.</span>
              </h1>
              <p className="max-w-[535px] text-lg leading-[1.65] text-[#c8d2da]">Discover colleges, make sense of your options, and move through admissions with a plan built around you.</p>
              <div className="flex flex-wrap items-center gap-6">
                <Action href="#guidance" arrow="arrow-gold-btn">
                  Talk to a counsellor
                </Action>
                <Link href="/colleges" className="text-sm font-semibold text-white hover:underline">
                  Explore colleges →
                </Link>
              </div>
              <p className="text-xs text-[#c8d2da]">For students and parents · No pressure to apply</p>
            </div>
            <figure className="relative h-[340px] w-full overflow-hidden rounded-[8px] rounded-tl-[90px] sm:h-[490px] lg:flex-1 lg:rounded-tl-[130px]">
              <Image src="/udan/campus-life.jpg" alt="Students walking through the arched courtyard of a college campus" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[210px] bg-gradient-to-b from-[rgba(16,40,63,0)] to-[rgba(11,29,48,0.85)]" />
              <figcaption className="absolute bottom-7 left-[30px] right-[30px] space-y-[9px]">
                <span className="block text-[10px] font-semibold tracking-[1.8px] text-[#edbf54]">POSSIBILITIES START HERE</span>
                <span className="block font-[family-name:var(--font-udan-serif)] text-xl text-white sm:text-2xl">Find a place where you can grow.</span>
              </figcaption>
            </figure>
          </div>
          <div className="mt-9">
            <UdanSearch />
          </div>
          <nav aria-label="Popular searches" className="mt-9 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-xs">
            <span className="text-[#c8d2da]">Popular searches</span>
            {POPULAR.map(([label, href]) => (
              <Link key={label} href={href} className="text-white hover:underline">
                {label} ↗
              </Link>
            ))}
          </nav>
        </section>

        {/* Commitments */}
        <ul className={`flex flex-col gap-4 border-b border-[#dfe3e5] py-7 text-sm font-medium sm:flex-row sm:flex-wrap sm:justify-between ${gutter}`}>
          {[
            ["compass", "Options that fit your goals"],
            ["list-checks", "Clarity on fees & eligibility"],
            ["handshake", "Support, not admission promises"],
          ].map(([icon, label]) => (
            <li key={icon} className="flex items-center gap-3">
              <img src={`/udan/${icon}.svg`} alt="" width={23} height={23} />
              {label}
            </li>
          ))}
        </ul>

        {/* Explore courses */}
        <section aria-labelledby="udan-courses" className={`py-20 ${gutter}`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[850px]">
              <Intro id="udan-courses" label="START WITH WHAT INTERESTS YOU" title="Big possibilities. Find your field." />
            </div>
            <Link href="/courses" className="text-sm font-semibold hover:underline">
              View all courses ↗
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
            {COURSE_FAMILIES.map((c) => (
              <li key={c.field}>
                <Link href={c.href} className="flex h-full flex-col gap-3.5 rounded-[10px] border border-[#dfe3e5] p-[21px] hover:border-[#10283f] focus-visible:ring-2 focus-visible:ring-[#edbf54] focus-visible:outline-none">
                  <span className="flex size-[42px] items-center justify-center rounded-md bg-[#faf0d6]">
                    <img src={`/udan/${c.icon}.svg`} alt="" width={23} height={23} />
                  </span>
                  <span className="space-y-[7px]">
                    <span className="block text-base font-semibold">{c.field}</span>
                    <span className={`block text-[11px] ${muted}`}>{c.degrees}</span>
                  </span>
                  <span className="text-xs font-semibold">Explore →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Destinations */}
        <section aria-labelledby="udan-destinations" className={`bg-[#f7f5ef] pt-[72px] pb-16 ${gutter}`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[870px]">
              <Intro id="udan-destinations" label="FIND YOUR KIND OF CAMPUS" title="Where do you see yourself?">
                Start with a city. Then compare the colleges, courses and costs that matter to you.
              </Intro>
            </div>
            <Link href="/colleges" className="text-sm font-semibold hover:underline">
              Browse all colleges ↗
            </Link>
          </div>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {DESTINATIONS.map((d) => (
              <li key={d.city} className="overflow-hidden rounded-[10px] border border-[#dfe3e5] bg-white">
                <div className="relative h-[218px]">
                  <Image src={d.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                </div>
                <div className="space-y-4 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-[5px]">
                      <h3 className="font-[family-name:var(--font-udan-serif)] text-[25px]">{d.city}</h3>
                      <p className={`text-xs ${muted}`}>{d.region}</p>
                    </div>
                    <Link href={d.href} aria-label={`Find colleges in ${d.city}`} className="flex size-[38px] items-center justify-center rounded-full bg-[#faf0d6] hover:bg-[#f3e2b3]">
                      <Arrow file="arrow-destination" />
                    </Link>
                  </div>
                  <hr className="border-[#dfe3e5]" />
                  <p className={`text-[13px] ${muted}`}>{d.interests}</p>
                  <Link href={d.href} className="block text-[13px] font-semibold hover:underline">
                    Find colleges in {d.city} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-2 text-[13px] lg:flex-row lg:items-center lg:justify-between">
            <p className={muted}>Compare more than a name:</p>
            <p className="font-medium whitespace-pre-wrap">{"Eligibility  /  Total fees  /  Recognition  /  Campus fit"}</p>
            <p className={`text-[11px] ${muted}`}>Campus imagery is illustrative.</p>
          </div>
        </section>

        {/* Personal counselling */}
        <section id="counselling" aria-labelledby="udan-counselling" className={`flex flex-col items-center gap-12 py-16 lg:flex-row lg:gap-[88px] lg:py-[88px] ${gutter}`}>
          <figure className="relative h-[420px] w-full overflow-hidden rounded-[10px] sm:h-[526px] lg:w-[520px] lg:shrink-0">
            <Image src="/udan/counselling.jpg" alt="A counsellor talking with a student and parent" fill sizes="(min-width: 1024px) 520px, 100vw" className="object-cover" />
            <figcaption className="absolute inset-x-6 bottom-6 space-y-[9px] rounded-md bg-white p-[22px]">
              <span className="block font-[family-name:var(--font-udan-serif)] text-xl">Your questions belong here.</span>
              <span className={`block text-[13px] leading-[1.6] ${muted}`}>
                Not sure what to study? Choosing between offers?
                <br />
                Let’s work through it, together.
              </span>
            </figcaption>
          </figure>
          <div className="w-full flex-1 space-y-[26px]">
            <Intro id="udan-counselling" label="A PERSON, NOT JUST A PORTAL" title="You don’t have to figure it all out alone.">
              A good counsellor listens first. We help turn your interests, academic profile and budget into practical next steps.
            </Intro>
            <ol className="space-y-[18px]">
              {SUPPORT.map(([title, text], i) => (
                <li key={title} className="flex gap-[18px]">
                  <span className={`text-xs font-semibold ${muted}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="space-y-1.5">
                    <span className="block text-base font-semibold">{title}</span>
                    <span className={`block text-sm leading-[1.6] ${muted}`}>{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Action href="#guidance" tone="navy" arrow="arrow-counselling-btn">
              Plan my next step
            </Action>
          </div>
        </section>

        {/* Admissions journey */}
        <section aria-labelledby="udan-journey" className={`bg-[#edf1f4] pt-[72px] pb-16 ${gutter}`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-20">
            <div className="lg:w-[650px] lg:shrink-0">
              <Intro id="udan-journey" label="FROM POSSIBILITIES TO A PLAN" title="Know what comes next." />
            </div>
            <p className={`text-[15px] leading-[1.65] ${muted}`}>A clear, collaborative process—with you and your family in control at every step.</p>
          </div>
          <ol className="mt-[38px] grid gap-[30px] sm:grid-cols-2 xl:grid-cols-4">
            {JOURNEY.map(([title, text, outcome], i) => (
              <li key={title} className="space-y-[18px]">
                <span className="flex items-center gap-4">
                  <span className="flex size-[38px] items-center justify-center rounded-full bg-white text-xs font-semibold">{String(i + 1).padStart(2, "0")}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-[#dfe3e5]" />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className={`text-sm leading-[1.65] ${muted}`}>{text}</p>
                <p className="text-xs font-medium">{outcome}</p>
              </li>
            ))}
          </ol>
          <div className="mt-[38px] flex items-center gap-3.5 rounded-md bg-white p-5">
            <img src="/udan/shield-check.svg" alt="" width={22} height={22} className="shrink-0" />
            <div className="space-y-[5px]">
              <p className="text-[13px] font-semibold">Guidance with clear boundaries.</p>
              <p className={`text-xs leading-[1.6] ${muted}`}>We explain any service charges and institutional relationships before you proceed. Admission decisions rest with colleges and official counselling authorities; no seat is guaranteed.</p>
            </div>
          </div>
        </section>

        {/* Resources */}
        <section id="resources" aria-labelledby="udan-resources" className={`py-20 ${gutter}`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[930px]">
              <Intro id="udan-resources" label="THE INFORMED STUDENT" title="A little preparation. A lot more confidence." />
            </div>
            <Link href="/faq" className="text-sm font-semibold hover:underline">
              All resources ↗
            </Link>
          </div>
          <ul className="mt-[34px] grid gap-6 md:grid-cols-3">
            {GUIDES.map((g) => (
              <li key={g.title} className="flex flex-col gap-[22px] rounded-[10px] border border-[#dfe3e5] p-7">
                <div className="flex items-center justify-between">
                  <img src={`/udan/${g.icon}.svg`} alt="" width={28} height={28} />
                  <span className={`text-[10px] font-semibold tracking-[0.8px] ${muted}`}>{g.category}</span>
                </div>
                <div className="min-h-[155px] space-y-[13px]">
                  <h3 className="font-[family-name:var(--font-udan-serif)] text-[22px] leading-[1.45] tracking-[-0.5px]">{g.title}</h3>
                  <p className={`text-sm leading-[1.65] ${muted}`}>{g.summary}</p>
                </div>
                <hr className="border-[#dfe3e5]" />
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-xs ${muted}`}>{g.where}</span>
                  <Link href={g.href} className="text-[13px] font-semibold hover:underline">
                    Read guide ↗<span className="sr-only">: {g.title}</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className={`mt-[34px] text-xs leading-[1.6] ${muted}`}>Before you apply, confirm current eligibility, fees and deadlines on the institution’s official website and relevant counselling portals.</p>
        </section>

        {/* Institutions */}
        <section id="institutions" aria-labelledby="udan-institutions" className={`flex flex-col items-center gap-12 bg-[#10283f] py-20 lg:flex-row lg:gap-[100px] ${gutter}`}>
          <div className="w-full space-y-[26px] lg:w-[650px] lg:shrink-0">
            <Intro id="udan-institutions" light label="FOR COLLEGES & UNIVERSITIES" title="Connect with students who see a future with you.">
              Bring your programmes to the right conversations. Partner with Udaan for clear programme discovery and a more considered admissions journey.
            </Intro>
            <Checks icon="check-gold" tone="text-[#c8d2da]" items={["Present accurate courses, entry criteria and fee information", "Support relevant enquiries with a shared follow-up process", "Keep student consent and transparent communication central"]} />
            <Action href="/contact?topic=partnership" arrow="arrow-partner-btn">
              Discuss a partnership
            </Action>
            <p className="text-xs text-[#c8d2da]">For admissions teams and institutional decision-makers.</p>
          </div>
          <div className="w-full flex-1 overflow-hidden rounded-[10px] bg-white">
            <div className="relative h-[150px]">
              <Image src="/udan/academic-setting.jpg" alt="" fill sizes="(min-width: 1024px) 514px, 100vw" className="object-cover" />
            </div>
            <div className="space-y-5 p-[30px]">
              <h3 className="font-[family-name:var(--font-udan-serif)] text-[22px] leading-[1.4]">A partnership built on alignment.</h3>
              {[
                ["Discover", "Tell us about your programmes and admissions priorities."],
                ["Define", "Agree on scope, responsibilities and commercial terms."],
                ["Collaborate", "Plan communication, enquiry handling and review points."],
              ].map(([stage, text]) => (
                <div key={stage} className="space-y-1.5">
                  <p className="text-[13px] font-semibold">{stage}</p>
                  <p className={`text-xs leading-[1.6] ${muted}`}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="udan-faq" className={`flex flex-col gap-12 py-16 lg:flex-row lg:gap-[100px] lg:py-[88px] ${gutter}`}>
          <div className="space-y-6 lg:w-[440px] lg:shrink-0">
            <Intro id="udan-faq" label="CLEAR ANSWERS, BEFORE YOU BEGIN" title="A few things you might be wondering.">
              College decisions come with questions. Let’s start with the important ones.
            </Intro>
            <a href="#guidance" className="inline-block text-sm font-semibold hover:underline">
              Ask a counsellor →
            </a>
          </div>
          <div className="flex-1 border-y border-[#dfe3e5]">
            {FAQS.map(([q, a], i) => (
              <details key={q} open={i === 0} className="group border-[#dfe3e5] [&:not(:first-child)]:border-t">
                <summary className="flex cursor-pointer list-none items-center gap-6 py-6 text-[15px] font-medium group-open:font-semibold group-open:text-base [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{q}</span>
                  <img src="/udan/plus.svg" alt="" width={18} height={18} className="group-open:hidden" />
                  <img src="/udan/minus.svg" alt="" width={18} height={18} className="hidden group-open:block" />
                </summary>
                <p className={`-mt-2 pb-6 text-sm leading-[1.75] ${muted}`}>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Request guidance */}
        <section id="guidance" aria-labelledby="udan-guidance" className={`flex flex-col items-center gap-12 bg-[#f7f5ef] py-20 lg:flex-row lg:gap-[100px] ${gutter}`}>
          <div className="w-full space-y-7 lg:w-[500px] lg:shrink-0">
            <Intro id="udan-guidance" label="ONE CONVERSATION IS A GOOD START" title="Your future deserves a thoughtful first step.">
              Tell us a little about yourself. A Udaan counsellor can help you understand your options and decide where to go next.
            </Intro>
            <Checks icon="check" tone={muted} items={["A conversation about your goals, not a sales pitch", "Space for your questions—and your family’s", "Clear next steps, with no obligation to apply"]} />
            <a href="#institutions" className="block text-[13px] hover:underline">
              Represent a college? Explore partnerships instead ↗
            </a>
          </div>
          <div className="w-full flex-1">
            <UdanCallbackForm />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`bg-[#0b1d30] pt-[60px] pb-7 text-[#c8d2da] ${gutter}`}>
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-[85px]">
          <div className="space-y-[22px] lg:w-[440px] lg:shrink-0">
            <Brand light />
            <p className="font-[family-name:var(--font-udan-serif)] text-[25px] leading-[1.5] text-white">
              Big ambitions.
              <br />A path that’s yours.
            </p>
            <p className="max-w-[330px] text-xs leading-[1.7]">College discovery and admissions guidance for students and families across India.</p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-10 sm:grid-cols-3">
            {[
              ["For students", [["Find colleges", "/colleges"], ["Explore courses", "/courses"], ["Counselling", "#counselling"], ["Student resources", "#resources"]]],
              ["For institutions", [["Partner with Udaan", "#institutions"], ["Our approach", "#institutions"], ["Partnership enquiry", "/contact?topic=partnership"]]],
              ["About Udaan", [["Our purpose", "/about"], ["How we work", "/admission-process"], ["FAQs", "/faq"], ["Contact us", "/contact"]]],
            ].map(([heading, links]) => (
              <nav key={heading as string} aria-label={heading as string} className="flex flex-col gap-[18px] text-xs">
                <p className="text-[13px] font-semibold text-white">{heading as string}</p>
                {(links as string[][]).map(([l, href]) => (
                  <Link key={l} href={href!} className="hover:text-white hover:underline">
                    {l}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-11 space-y-5 border-t border-[#375066] pt-5 text-[11px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Udaan. All rights reserved.</p>
            <nav aria-label="Policies" className="flex flex-wrap gap-6">
              <Link href="/privacy" className="hover:text-white hover:underline">
                Privacy policy
              </Link>
              <Link href="/terms" className="hover:text-white hover:underline">
                Terms of use
              </Link>
              <Link href="/terms" className="hover:text-white hover:underline">
                Service &amp; fee policy
              </Link>
            </nav>
          </div>
          <p className="text-[10px] leading-[1.7]">Udaan provides guidance, not guaranteed admission. Eligibility, fees and availability are set by institutions and official authorities. Always confirm the latest information before applying.</p>
        </div>
      </footer>
    </div>
  );
}
