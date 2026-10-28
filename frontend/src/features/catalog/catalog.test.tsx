import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { OfferingFees, feeBody, formFromFee } from "@/features/admin/catalog/FeeEditor";
import { api, apiGet, apiPost } from "@/services/api";
import type { AdminOffering, CollegeCard as Card, FeeBreakdown as Breakdown } from "@/types/catalog";
import { CollegeCard, CompareToggle, FeeBreakdown, SAMPLE_LABEL } from "./CatalogUi";
import CollegeDirectory, { apiQuery, readFilters } from "./CollegeDirectory";
import { COMPARE_MAX, compareStore, resetCatalogStores } from "./stores";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/colleges",
  useSearchParams: () => nav.params,
  useParams: () => ({}),
}));

const college = (over: Partial<Card> = {}): Card => ({
  id: "c1",
  name: "Sample Institute of Technology, Pune",
  slug: "sample-institute-of-technology-pune",
  type: "private",
  city: "Pune",
  state: "Maharashtra",
  logoUrl: null,
  featured: false,
  isSample: true,
  lastVerifiedAt: null,
  accreditations: [],
  courses: [{ id: "k1", name: "B.Tech / B.E.", slug: "btech-be", level: "ug" }],
  feeFromMinor: 64_000_000,
  feeToMinor: 64_000_000,
  ...over,
});

const signedOut = () => vi.mocked(apiGet).mockImplementation(async (path: string) => {
  if (path === "/auth/me") throw { status: 401, code: "UNAUTHORIZED", message: "Please sign in" };
  if (path === "/locations") return [{ id: "l1", name: "Delhi NCR", slug: "delhi-ncr", kind: "region", parents: [], isActive: true, sortOrder: 1 }];
  if (path === "/courses") return [{ id: "k1", name: "B.Tech / B.E.", slug: "btech-be", level: "ug", category: "Engineering", typicalDurationMonths: 48, isActive: true, sortOrder: 1 }];
  return [];
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  resetCatalogStores();
  sessionStorage.clear();
});

describe("college directory", () => {
  it("turns URL filters into a safe API query (budget in rupees -> paise; junk dropped)", () => {
    const f = readFilters(new URLSearchParams("q=btech&location=delhi-ncr&budget=600000&percentage=72&type=castle&sort=fee_low&course=<script>"));
    expect(Object.fromEntries(new URLSearchParams(apiQuery(f)))).toEqual({ q: "btech", location: "delhi-ncr", maxBudget: "60000000", percentage: "72", sort: "fee_low", limit: "12" });
  });

  it("requests colleges for the URL filters, shows sample labels, and updates the URL when a filter changes", async () => {
    signedOut();
    nav.params = new URLSearchParams("location=delhi-ncr");
    vi.mocked(api).mockResolvedValue({ data: [college()], meta: { page: 1, limit: 12, total: 1, totalPages: 1, hasSamples: true } });
    render(
      <AuthProvider>
        <CollegeDirectory />
      </AuthProvider>,
    );
    expect(await screen.findByText("1 college found")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("GET", "/colleges?location=delhi-ncr&limit=12", expect.anything());
    expect(screen.getByText("This directory currently includes sample data")).toBeInTheDocument();
    expect(screen.getAllByText(SAMPLE_LABEL, { exact: false }).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("option", { name: "B.Tech / B.E." })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Course"), "btech-be");
    expect(nav.replace).toHaveBeenCalledWith("/colleges?course=btech-be&location=delhi-ncr", { scroll: false });
  });
});

describe("college card", () => {
  it("labels sample data and shows official fees; real colleges show their verified date instead", async () => {
    signedOut();
    const { rerender } = render(
      <AuthProvider>
        <CollegeCard college={college()} />
      </AuthProvider>,
    );
    expect(screen.getByText(SAMPLE_LABEL)).toBeInTheDocument();
    expect(screen.getByText("₹6.4 lakh")).toBeInTheDocument();
    rerender(
      <AuthProvider>
        <CollegeCard college={college({ isSample: false, name: "Real College", lastVerifiedAt: "2026-06-15T00:00:00.000Z" })} />
      </AuthProvider>,
    );
    expect(screen.queryByText(SAMPLE_LABEL)).not.toBeInTheDocument();
    expect(screen.getByText(/Details last verified 15 Jun 2026/)).toBeInTheDocument();
    // Signed-out visitors are sent to sign in to save a college.
    expect(await screen.findByRole("link", { name: "♡ Save" })).toHaveAttribute("href", "/login?next=%2Fcolleges");
  });
});

describe("fee breakdown", () => {
  it("keeps official fees, the consultancy charge and optional fees in separate sections", () => {
    const b: Breakdown = {
      currency: "INR",
      durationMonths: 48,
      lines: [
        { key: "tuition", label: "Tuition fee", group: "official", frequency: "per_year", amountMinor: 10_000_000, occurrences: 4, courseTotalMinor: 40_000_000 },
        { key: "hostel", label: "Hostel (if opted)", group: "optional", frequency: "per_year", amountMinor: 8_000_000, occurrences: 4, courseTotalMinor: 32_000_000 },
      ],
      officialTotalMinor: 40_000_000,
      discountMinor: 0,
      discountNote: "",
      officialAfterDiscountMinor: 40_000_000,
      optionalTotalMinor: 32_000_000,
      consultancyServiceChargeMinor: 1_000_000,
      estimatedTotalMinor: 41_000_000,
    };
    render(<FeeBreakdown breakdown={b} />);
    expect(screen.getByRole("columnheader", { name: "Official college fees" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Consultancy service charge \(separate/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Optional/ })).toBeInTheDocument();
    const officialRow = screen.getByRole("row", { name: /Official college fees \(whole course\)/ });
    expect(within(officialRow).getByText("₹4,00,000")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /EduPath service charge/ })).getByText("₹10,000")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Estimated total/ })).getByText("₹4,10,000")).toBeInTheDocument();
  });
});

describe("compare tray", () => {
  it(`holds at most ${COMPARE_MAX} colleges`, async () => {
    for (let i = 1; i <= COMPARE_MAX; i++) expect(compareStore.toggle({ slug: `c${i}`, name: `College ${i}` })).toBe("added");
    expect(compareStore.toggle({ slug: "c5", name: "College 5" })).toBe("full");
    render(<CompareToggle slug="c6" name="College 6" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Compare" }));
    expect(screen.getByRole("alert")).toHaveTextContent(`up to ${COMPARE_MAX} colleges`);
    expect(JSON.parse(sessionStorage.getItem("ec.compare")!)).toHaveLength(COMPARE_MAX);
  });
});

describe("admin fee editor", () => {
  it("converts rupees to paise and validates before sending", () => {
    const form = formFromFee();
    expect(feeBody(form).errors["amount.tuition"]).toBe("Enter the tuition fee");
    form.amounts.tuition = "1,25,000.50";
    form.amounts.hostel = "abc";
    expect(feeBody(form).errors["amount.hostel"]).toBeTruthy();
    form.amounts.hostel = "";
    const { body } = feeBody({ ...form, consultancy: "10000", discountType: "percent", discountValue: "10", discountMax: "20000" });
    expect(body).toMatchObject({ components: [{ key: "tuition", amountMinor: 12_500_050, frequency: "per_year" }], consultancyServiceChargeMinor: 1_000_000, discount: { type: "percent", value: 10, maxMinor: 2_000_000 } });
  });

  it("asks the server for a preview of the totals", async () => {
    vi.mocked(apiGet).mockResolvedValue([]);
    vi.mocked(apiPost).mockResolvedValue({
      currency: "INR",
      durationMonths: 48,
      lines: [{ key: "tuition", label: "Tuition fee", group: "official", frequency: "per_year", amountMinor: 10_000_000, occurrences: 4, courseTotalMinor: 40_000_000 }],
      officialTotalMinor: 40_000_000,
      discountMinor: 0,
      discountNote: "",
      officialAfterDiscountMinor: 40_000_000,
      optionalTotalMinor: 0,
      consultancyServiceChargeMinor: 0,
      estimatedTotalMinor: 40_000_000,
    } satisfies Breakdown);
    const offering: AdminOffering = { id: "o1", college: "c1", course: "k1", specialization: "", durationMonths: 48, seats: null, eligibilityText: "", minPercentage: null, entranceExams: [], applicationDeadline: null, admissionProcess: "", status: "active" };
    render(<OfferingFees offering={offering} courseName="B.Tech / B.E." />);
    expect(await screen.findByText("No fees yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New fee draft" }));
    await userEvent.type(screen.getByLabelText("Tuition fee (₹)"), "100000");
    await userEvent.click(screen.getByRole("button", { name: "Preview totals" }));
    expect(apiPost).toHaveBeenCalledWith("/admin/fees/preview", { durationMonths: 48, components: [{ key: "tuition", amountMinor: 10_000_000, frequency: "per_year" }], consultancyServiceChargeMinor: 0, discount: null });
    expect(await screen.findByText("Server-calculated preview")).toBeInTheDocument();
  });
});
