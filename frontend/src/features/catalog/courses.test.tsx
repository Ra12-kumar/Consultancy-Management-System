import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaProblem } from "@/features/admin/catalog/MediaUpload";
import { api } from "@/services/api";
import type { BrowseOffering, CollegeDetail } from "@/types/catalog";
import { CollegeLinks, CourseExtras } from "./CollegeExtras";
import CourseBrowser, { browseQuery } from "./CourseBrowser";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, usePathname: () => "/courses/browse", useRouter: () => ({ push: vi.fn(), replace: nav.replace }) }));

const offering: BrowseOffering = {
  id: "o1",
  course: { name: "MBA / PGDM", slug: "mba-pgdm", level: "pg", category: "Management" },
  college: { name: "Chennai Business School", slug: "chennai-biz", city: "Chennai", state: "Tamil Nadu", logoUrl: null, isSample: false },
  specialization: "Finance",
  description: "",
  durationMonths: 24,
  mode: "hybrid",
  seats: 60,
  minQualification: "undergraduate",
  minPercentage: 50,
  entranceExams: ["CAT"],
  eligibilityText: "",
  applicationDeadline: "2027-03-31T00:00:00.000Z",
  imageUrl: null,
  brochureUrl: null,
  fee: { academicYear: "2026-27", yearlyMinor: 40_000_000, totalMinor: 80_000_000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  vi.mocked(api).mockResolvedValue({ data: [offering], meta: { page: 1, limit: 12, total: 1, totalPages: 1 } });
});

describe("course browser", () => {
  it("lists courses with fee, eligibility and mode, and links to the college and an enquiry for that course", async () => {
    nav.params = new URLSearchParams("level=pg&mode=hybrid&view=x");
    render(<CourseBrowser />);
    const card = within(await screen.findByRole("article"));
    expect(api).toHaveBeenCalledWith("GET", "/courses/offerings?level=pg&mode=hybrid", expect.anything());
    expect(card.getByText(/4,00,000 \/ year/)).toBeInTheDocument();
    expect(card.getByText("Undergraduate degree, 50%+")).toBeInTheDocument();
    expect(card.getByText("Hybrid")).toBeInTheDocument();
    expect(card.getByRole("link", { name: "Enquire Now" })).toHaveAttribute("href", "/enquire?college=chennai-biz&course=mba-pgdm&source=college_search");
    expect(card.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/colleges/chennai-biz");
  });

  it("changes filters through the URL and searches as you type", async () => {
    render(<CourseBrowser />);
    await screen.findByRole("article");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Fees up to (per year)" }), "200000");
    expect(nav.replace).toHaveBeenLastCalledWith("/courses/browse?maxFee=200000", { scroll: false });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "My qualification" }), "class_12");
    expect(nav.replace).toHaveBeenLastCalledWith("/courses/browse?qualification=class_12", { scroll: false });
    await userEvent.type(screen.getByRole("searchbox", { name: /Course or college/ }), "mba");
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith("/courses/browse?q=mba", { scroll: false }));
    expect(browseQuery(new URLSearchParams("q=a&evil=1&page=2")).toString()).toBe("q=a&page=2");
  });
});

describe("college extras", () => {
  it("shows only https social pages and our own brochure files", () => {
    const c = { social: { instagram: "https://instagram.com/alpha", facebook: "javascript:alert(1)", x: "http://x.com/a" }, brochureUrl: "/api/colleges/brochures/0123456789abcdef01234567", admissionInfo: "Rounds in June." } as unknown as CollegeDetail;
    render(<CollegeLinks c={c} />);
    expect(screen.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://instagram.com/alpha");
    expect(screen.queryByRole("link", { name: /Facebook/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /X \(Twitter\)/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Download brochure (PDF)" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Rounds in June.")).toBeInTheDocument();
  });

  it("shows the course mode and minimum qualification, never an outside brochure address", () => {
    render(<CourseExtras o={{ ...offering, course: null, college: "c1", fees: [], brochureUrl: "https://evil.example/x.pdf", admissionProcess: "" } as never} />);
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByText(/Minimum: Undergraduate degree/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /brochure/i })).toBeNull();
  });

  it("checks file type and size before uploading", () => {
    expect(mediaProblem(new File(["x"], "a.pdf", { type: "application/pdf" }), "image")).toMatch(/JPEG/);
    expect(mediaProblem(new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }), "pdf")).toMatch(/10 MB/);
    expect(mediaProblem(new File(["x"], "b.pdf", { type: "application/pdf" }), "pdf")).toBeNull();
  });
});
