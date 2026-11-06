import { api, apiGet } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { CollegeCard, CollegeDetail } from "@/types/catalog";
import type { FinderCollege, FinderResult } from "@/features/catalog/CollegeFinder";

// The universities the Online UG & PG section highlights. Only the selection lives here: a label, the words used
// to look each one up and the pattern a record's name must match. Every detail shown (name, logo, description,
// courses, website) comes from the existing college APIs; nothing about a college is written in this file.
export type OnlineUniversity = { key: string; label: string; query: string; match: RegExp };

export const ONLINE_UNIVERSITIES: OnlineUniversity[] = [
  { key: "sharda", label: "Sharda", query: "Sharda University", match: /\bsharda university\b/i },
  { key: "parul", label: "Parul", query: "Parul University", match: /\bparul university\b/i },
  { key: "nmims", label: "NMIMS", query: "Narsee Monjee Institute of Management Studies", match: /\b(narsee monjee institute of management studies|nmims)\b/i },
  { key: "jain", label: "Jain", query: "Jain University", match: /^jain\b.*\b(university|deemed)/i },
  { key: "vignan", label: "Vignan's Online", query: "Vignan's Foundation", match: /\bvignan'?s (foundation|university)\b/i },
  { key: "niu", label: "NIU", query: "Noida International University", match: /\bnoida international university\b/i },
  { key: "bharathidasan", label: "Bharathidasan", query: "Bharathidasan University", match: /^bharathidasan university\b/i },
  { key: "amrita", label: "Amrita Online", query: "Amrita Vishwa Vidyapeetham", match: /\bamrita (vishwa vidyapeetham|university)\b/i },
  { key: "gla", label: "GLA", query: "GLA University", match: /^gla university\b/i },
  { key: "shoolini", label: "Shoolini", query: "Shoolini University", match: /\bshoolini university\b/i },
  { key: "smu", label: "Sikkim Manipal", query: "Sikkim Manipal University", match: /\bsikkim manipal\b/i },
  { key: "vgu", label: "VGU", query: "Vivekananda Global University", match: /\bvivekananda global university\b/i },
  { key: "uttaranchal", label: "Uttaranchal", query: "Uttaranchal University", match: /\buttaranchal university\b/i },
  { key: "jamia-hamdard", label: "Jamia Hamdard", query: "Jamia Hamdard", match: /^jamia hamdard\b/i },
  { key: "jindal", label: "O.P. Jindal", query: "Jindal Global University", match: /\bjindal global university\b/i },
  { key: "dyp-pune", label: "D.Y. Patil Pune", query: "Patil Vidyapeeth", match: /\bd\.?\s?y\.?\s?patil vidyapeeth\b/i },
  { key: "dyp-mumbai", label: "D.Y. Patil Mumbai", query: "DY Patil University", match: /\bd\.?\s?y\.?\s?patil university\b/i },
  { key: "upes", label: "UPES", query: "University of Petroleum and Energy Studies", match: /\b(university of petroleum and energy studies|upes)\b/i },
  { key: "cu", label: "Chandigarh University", query: "Chandigarh University", match: /^chandigarh university\b/i },
  { key: "lpu", label: "LPU", query: "Lovely Professional University", match: /\blovely professional university\b/i },
  { key: "muj", label: "Manipal Jaipur", query: "Manipal University Jaipur", match: /\bmanipal university,? jaipur\b/i },
  { key: "amity", label: "Amity", query: "Amity University", match: /^amity university\b/i },
  { key: "mangalayatan", label: "Mangalayatan", query: "Mangalayatan University", match: /^mangalayatan university\b/i },
];

export type ProgramLevel = "ug" | "pg";
export type OnlineCourse = { id: string; name: string; specialization: string; level: ProgramLevel; durationMonths: number };
// catalogue: a published college record; finder: only the college finder knows it (name, place, checked website);
// not_found: neither source has it; pending: the finder list is still loading; error: its lookup failed.
export type OnlineCollegeStatus = "catalogue" | "finder" | "not_found" | "pending" | "error";
export type OnlineCollege = {
  key: string;
  label: string;
  status: OnlineCollegeStatus;
  name: string | null;
  slug: string | null;
  city: string;
  state: string;
  logoUrl: string | null;
  about: string;
  website: string | null;
  courses: OnlineCourse[];
  // When the catalogue record was last verified, and a campus photo an admin added (null when none).
  verifiedAt: string | null;
  photoUrl: string | null;
};

// UG = undergraduate degrees; PG = postgraduate degrees and PG diplomas. Other levels are outside this section.
export const levelOf = (level: string | undefined): ProgramLevel | null => (level === "ug" ? "ug" : level === "pg" || level === "pg_diploma" ? "pg" : null);

const blank = (u: OnlineUniversity, status: OnlineCollegeStatus): OnlineCollege => ({ key: u.key, label: u.label, status, name: null, slug: null, city: "", state: "", logoUrl: null, about: "", website: null, courses: [], verifiedAt: null, photoUrl: null });

// The record that best stands for the university: one with a website first, then the shortest (main) name.
export function bestMatch<T extends { name: string; website?: string | null }>(u: OnlineUniversity, items: T[]): T | null {
  const hits = items.filter((i) => u.match.test(i.name));
  hits.sort((a, b) => Number(Boolean(b.website)) - Number(Boolean(a.website)) || a.name.length - b.name.length);
  return hits[0] ?? null;
}

// Runs the lookups a few at a time, so one page visit stays well inside the API's per-network request limit.
async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    }),
  );
  return out;
}

const CATALOGUE_PAGE = 50;
const CATALOGUE_PAGES = 3;

// Published colleges of the catalogue: read whole when small (a few requests), else searched per university.
async function catalogueColleges(signal: AbortSignal): Promise<CollegeCard[] | null> {
  const all: CollegeCard[] = [];
  for (let page = 1; page <= CATALOGUE_PAGES; page++) {
    const { data, meta } = await api<CollegeCard[]>("GET", `/colleges?sort=name&limit=${CATALOGUE_PAGE}&page=${page}`, { signal });
    all.push(...data);
    const total = (meta as PageMeta | undefined)?.total ?? all.length;
    if (total > CATALOGUE_PAGE * CATALOGUE_PAGES) return null;
    if (all.length >= total || data.length < CATALOGUE_PAGE) break;
  }
  return all;
}

async function fromCatalogue(u: OnlineUniversity, card: CollegeCard, signal: AbortSignal): Promise<OnlineCollege> {
  const d = await apiGet<CollegeDetail>(`/colleges/${encodeURIComponent(card.slug)}`, { signal });
  const courses: OnlineCourse[] = [];
  for (const o of d.offerings ?? []) {
    const level = levelOf(o.course?.level);
    if (o.mode === "online" && level && o.course) courses.push({ id: o.id, name: o.course.name, specialization: o.specialization ?? "", level, durationMonths: o.durationMonths });
  }
  // UG first, then PG; by course name within each.
  courses.sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name) || a.specialization.localeCompare(b.specialization));
  return { key: u.key, label: u.label, status: "catalogue", name: d.name, slug: d.slug, city: d.city ?? "", state: d.state ?? "", logoUrl: d.logoUrl ?? null, about: d.about ?? "", website: d.website ?? null, courses, verifiedAt: d.lastVerifiedAt ?? null, photoUrl: d.imageUrl ?? d.coverUrl ?? null };
}

async function fromFinder(u: OnlineUniversity, signal: AbortSignal): Promise<OnlineCollege> {
  const r = await apiGet<FinderResult>(`/colleges/explore?${new URLSearchParams({ q: u.query, limit: "24" })}`, { signal });
  if (r.status !== "ready") return blank(u, "pending");
  const hit = bestMatch<FinderCollege>(u, r.items ?? []);
  if (!hit) return blank(u, "not_found");
  return { ...blank(u, "finder"), name: hit.name, city: hit.city, state: hit.state, website: hit.website };
}

// Loads every highlighted university: the catalogue record when there is one (logo, description, online UG/PG
// courses), otherwise the college finder entry. A failed lookup marks only that university, not the whole page.
export async function loadOnlineColleges(signal: AbortSignal): Promise<OnlineCollege[]> {
  const listed = await catalogueColleges(signal);
  return pool(ONLINE_UNIVERSITIES, 4, async (u) => {
    try {
      let card: CollegeCard | null;
      if (listed) card = bestMatch(u, listed.filter((c) => !c.isSample));
      else {
        const { data } = await api<CollegeCard[]>("GET", `/colleges?${new URLSearchParams({ q: u.query, limit: "10" })}`, { signal });
        card = bestMatch(u, data.filter((c) => !c.isSample));
      }
      return card ? await fromCatalogue(u, card, signal) : await fromFinder(u, signal);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      return blank(u, "error");
    }
  });
}

// Search (university, record name, place or course), the UG/PG filter, and optional course and state filters,
// applied in the browser.
export function filterOnline(items: OnlineCollege[], q: string, level: "" | ProgramLevel, course = "", state = ""): OnlineCollege[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((c) => {
    if (level && !c.courses.some((x) => x.level === level)) return false;
    if (course && !c.courses.some((x) => x.name === course && (!level || x.level === level))) return false;
    if (state && c.state !== state) return false;
    if (!words.length) return true;
    const hay = [c.label, c.name, c.city, c.state, ...c.courses.flatMap((x) => [x.name, x.specialization])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
