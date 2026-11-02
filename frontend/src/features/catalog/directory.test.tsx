import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobRow, type ImportJob } from "@/features/admin/directory/CollegeData";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { api, apiGet } from "@/services/api";
import type { CollegeCard as Card, DirectoryCoverage } from "@/types/catalog";
import { BASIC_LABEL, CollegeCard } from "./CatalogUi";
import CollegeDirectory, { CoverageNote, apiQuery, readFilters } from "./CollegeDirectory";
import { resetCatalogStores } from "./stores";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/colleges",
  useSearchParams: () => nav.params,
  useParams: () => ({}),
}));

const coverage: DirectoryCoverage = { total: 43_796, byCategory: { college: 43_796 }, sources: [{ name: "AISHE (Ministry of Education)", records: 43_796, lastSyncedAt: "2026-10-01T00:00:00.000Z" }], statesCovered: 36, statesTotal: 36, withVerifiedFees: 12, lastImportAt: "2026-10-01T00:00:00.000Z", partial: true };

const basic = (over: Partial<Card> = {}): Card => ({
  id: "c1",
  name: "Government Arts College",
  slug: "government-arts-college-c-10001",
  type: "government",
  city: "",
  district: "Chennai",
  state: "Tamil Nadu",
  logoUrl: null,
  featured: false,
  isSample: false,
  lastVerifiedAt: null,
  accreditations: [],
  courses: [],
  feeFromMinor: null,
  feeToMinor: null,
  ownership: "government",
  category: "college",
  aisheCode: "C-10001",
  listingLevel: "basic",
  source: { name: "AISHE (Ministry of Education)", lastSyncedAt: "2026-10-01T00:00:00.000Z" },
  stale: false,
  fee: { basis: "total", amountMinor: null, status: "not_verified", academicYear: null, lastVerifiedAt: null },
  ...over,
});

function mockApis(items: Card[] = [basic()]) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/auth/me") throw { status: 401, code: "UNAUTHORIZED", message: "Please sign in" };
    if (path === "/colleges/filters") return { states: [{ name: "Uttar Pradesh", slug: "uttar-pradesh", count: 2 }], ownership: {}, categories: {}, approvals: ["AICTE", "UGC"], coverage };
    if (path === "/colleges/districts?state=uttar-pradesh") return [{ name: "Gautam Buddha Nagar", slug: "uttar-pradesh--gautam-buddha-nagar", count: 2 }];
    return [];
  });
  vi.mocked(api).mockResolvedValue({ data: items, meta: { page: 1, limit: 12, total: items.length, totalPages: 1, hasSamples: false, coverage } });
}

const renderDirectory = () =>
  render(
    <AuthProvider>
      <CollegeDirectory />
    </AuthProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  nav.params = new URLSearchParams();
  resetCatalogStores();
  sessionStorage.clear();
});

describe("directory query", () => {
  it("sends budgets on the chosen basis in paise, drops an inverted range and unsafe values", () => {
    const q = (s: string) => Object.fromEntries(new URLSearchParams(apiQuery(readFilters(new URLSearchParams(s)))));
    expect(q("basis=annual&min=100000&budget=200000&maxHostel=50000&unverified=yes")).toEqual({ feeBasis: "annual", minBudget: "10000000", maxBudget: "20000000", maxHostel: "5000000", includeUnverified: "yes", limit: "12" });
    // Min above max: the minimum is dropped rather than sent.
    expect(q("min=900000&budget=300000")).toEqual({ maxBudget: "30000000", limit: "12" });
    // "Include unverified" means nothing without a budget.
    expect(q("unverified=yes")).toEqual({ limit: "12" });
    // A district needs its state; junk values are never sent.
    expect(q("district=uttar-pradesh--gautam-buddha-nagar")).toEqual({ limit: "12" });
    expect(q("state=uttar-pradesh&district=uttar-pradesh--gautam-buddha-nagar&ownership=public&category=college&approval=aicte")).toEqual({ state: "uttar-pradesh", district: "uttar-pradesh--gautam-buddha-nagar", category: "college", limit: "12" });
  });
});

describe("directory page", () => {
  it("states the real coverage and never claims the list is complete", () => {
    render(<CoverageNote coverage={coverage} />);
    expect(screen.getByText("This directory is still growing")).toBeInTheDocument();
    expect(screen.getByText(/43,796 institutions across 36 of 36 states/)).toBeInTheDocument();
    expect(screen.getByText(/Not every institution in India is listed yet/)).toBeInTheDocument();
    expect(screen.getByText(/Verified fees are available for 12 of them/)).toBeInTheDocument();
  });

  it("shows removable chips for active filters, loads districts for the chosen state, and clears everything", async () => {
    mockApis();
    nav.params = new URLSearchParams("state=uttar-pradesh&basis=annual&budget=200000&ownership=private");
    renderDirectory();
    expect(await screen.findByText("1 college found")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("GET", "/colleges?state=uttar-pradesh&ownership=private&feeBasis=annual&maxBudget=20000000&limit=12", expect.anything());
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(await within(chips).findByRole("button", { name: "Remove filter: Uttar Pradesh" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Remove filter: Up to ₹2 lakh per year" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Gautam Buddha Nagar (2)" })).toBeInTheDocument();

    // Removing the state also removes its district.
    await userEvent.click(within(chips).getByRole("button", { name: "Remove filter: Uttar Pradesh" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?ownership=private&basis=annual&budget=200000", { scroll: false });
    await userEvent.click(within(chips).getByRole("button", { name: "Clear all" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges", { scroll: false });
  });

  it("debounces the name search into the URL", async () => {
    mockApis();
    renderDirectory();
    await screen.findByText("1 college found");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByRole("searchbox", { name: "College name" }), "arts");
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/colleges?q=arts", { scroll: false });
  });

  it("explains an empty budget search and offers to include unverified fees", async () => {
    mockApis([]);
    nav.params = new URLSearchParams("budget=300000");
    renderDirectory();
    expect(await screen.findByText("No colleges match these filters")).toBeInTheDocument();
    expect(screen.getByText(/Only colleges with verified fees match a budget/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Also show colleges without verified fees/ }));
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?budget=300000&unverified=yes", { scroll: false });
  });
});

describe("directory card", () => {
  it("labels basic listings and unverified fees honestly (never ₹0)", async () => {
    mockApis();
    render(
      <AuthProvider>
        <CollegeCard college={basic()} />
      </AuthProvider>,
    );
    expect(screen.getByText(new RegExp(BASIC_LABEL))).toBeInTheDocument();
    expect(screen.getByText("Fee not verified")).toBeInTheDocument();
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument();
    expect(screen.getByText(/AISHE C-10001/)).toBeInTheDocument();
    expect(screen.getByText("Government")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enquire Now" })).toHaveAttribute("href", "/enquire?college=government-arts-college-c-10001&source=college_search");
    // No photo and no website on record: a placeholder and a plain notice, never a guessed link.
    expect(screen.getByText("Photo not available")).toBeInTheDocument();
    expect(screen.getByText("Official website not available")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Visit Official Website/ })).not.toBeInTheDocument();
  });

  it("shows the verified fee on its basis, a not-comparable notice, and a stale flag", () => {
    mockApis();
    const { rerender } = render(
      <AuthProvider>
        <CollegeCard college={basic({ listingLevel: "detailed", fee: { basis: "annual", amountMinor: 15_000_000, status: "verified", academicYear: "2026-27", lastVerifiedAt: null } })} />
      </AuthProvider>,
    );
    expect(screen.getByText("₹1.5 lakh")).toBeInTheDocument();
    expect(screen.getByText(/a year \(2026-27\)/)).toBeInTheDocument();
    rerender(
      <AuthProvider>
        <CollegeCard college={basic({ stale: true, fee: { basis: "annual", amountMinor: null, status: "not_comparable", academicYear: null, lastVerifiedAt: null } })} />
      </AuthProvider>,
    );
    expect(screen.getByText(/No yearly fee to compare/)).toBeInTheDocument();
    expect(screen.getByText("May be out of date")).toBeInTheDocument();
  });
});

describe("card images and official website", () => {
  it("shows the college's own photo with alt text, falls back when it fails, and opens a safe website in a new tab", async () => {
    mockApis();
    const { container } = render(
      <AuthProvider>
        <CollegeCard college={basic({ coverUrl: "https://images.example.edu/campus.jpg", website: "http://www.gacchennai.edu.in/", courses: [{ id: "k1", name: "B.Sc", slug: "bsc", level: "ug" }] })} course="bsc" />
      </AuthProvider>,
    );
    const photo = screen.getByRole("img", { name: "Campus of Government Arts College" });
    expect(photo).toHaveAttribute("src", "https://images.example.edu/campus.jpg");
    expect(photo).toHaveAttribute("loading", "lazy");
    const site = screen.getByRole("link", { name: /Visit Official Website/ });
    expect(site).toHaveAttribute("href", "http://www.gacchennai.edu.in/");
    expect(site).toHaveAttribute("target", "_blank");
    expect(site.getAttribute("rel")).toContain("noopener");
    expect(site.getAttribute("rel")).toContain("noreferrer");
    // The searched course is passed to the existing enquiry form.
    expect(screen.getByRole("link", { name: "Enquire Now" })).toHaveAttribute("href", "/enquire?college=government-arts-college-c-10001&course=bsc&source=college_search");
    fireEvent.error(photo);
    expect(screen.getByText("Photo not available")).toBeInTheDocument();
    expect(container.querySelector("img[src*=campus]")).toBeNull();
  });

  it("never links unsafe or invalid website and image addresses", () => {
    mockApis();
    for (const website of ["javascript:alert(1)", "data:text/html,hi", "/relative/path", "ftp://files.example.com", "https://user:pw@example.com", "https://localhost/x"]) {
      const { unmount } = render(
        <AuthProvider>
          <CollegeCard college={basic({ website, coverUrl: "http://insecure.example.com/a.jpg" })} />
        </AuthProvider>,
      );
      expect(screen.queryByRole("link", { name: /Visit Official Website/ }), website).not.toBeInTheDocument();
      expect(screen.getByText("Official website not available")).toBeInTheDocument();
      // Images must be https.
      expect(screen.queryByRole("img", { name: /Campus of/ })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("admin import history", () => {
  const job = (over: Partial<ImportJob> = {}): ImportJob => ({
    id: "j1",
    importer: "aishe-colleges",
    sourceName: "AISHE (Ministry of Education)",
    fileName: "All Colleges AISHE.xlsx",
    sourceDataDate: null,
    fullSnapshot: true,
    status: "running",
    attempts: 1,
    totalRows: 1000,
    progress: 50,
    counts: { processed: 500, created: 480, updated: 0, unchanged: 0, skipped: 5, rejected: 15, duplicates: 2, conflicts: 0 },
    rowErrors: [{ row: 7, code: "UNKNOWN_STATE", message: '"Atlantis" is not an Indian state or union territory' }],
    failure: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-10-28T10:00:00.000Z",
    ...over,
  });

  it("shows progress and row errors, and offers a retry only for failed or interrupted imports", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<JobRow job={job()} onRetry={onRetry} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("500 of 1,000 rows")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/Rejected rows/));
    expect(screen.getByText(/"Atlantis" is not an Indian state/)).toBeInTheDocument();

    rerender(<JobRow job={job({ status: "failed", failure: "The import stopped. Retry to continue." })} onRetry={onRetry} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry from last checkpoint" }));
    expect(onRetry).toHaveBeenCalledWith("j1");
  });
});
