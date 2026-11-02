import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminOverview, { weeklyTotals } from "@/features/admin/AdminOverview";
import StudentHome, { greeting, milestoneOf } from "@/features/student/StudentHome";
import { apiGet } from "@/services/api";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ status: "signedIn", user: auth.user }), homeFor: () => "/" }));

const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count: i < 2 ? 100 : 1 }));
const summary = {
  totals: { students: 1248, activeColleges: 36 },
  students: { total: 1248 },
  catalog: { colleges: { published: 36 } },
  conversionRate: 6.8,
  charts: { enquiriesByDay: days, byStatus: [{ status: "NEW", count: 100 }, { status: "CONTACT_PENDING", count: 20 }, { status: "INTERESTED", count: 88 }, { status: "ADMITTED", count: 18 }] },
};
const counsellors = [{ id: "c1", name: "Priya S.", status: "active", stats: { assigned: 48, contacted: 41, overdue: 2, converted: 9 } }];

beforeEach(() => vi.clearAllMocks());

describe("admin dashboard (client design)", () => {
  it("shows the four headline figures, pipeline groups and counsellor performance", async () => {
    auth.user = { id: "a", name: "Admin", role: "admin", permissions: ["students.read", "admins.manage"] };
    vi.mocked(apiGet).mockImplementation(((path: string) => Promise.resolve(path.startsWith("/admin/team/counsellors") ? counsellors : summary)) as never);
    render(<AdminOverview />);
    expect(await screen.findByText("1,248")).toBeInTheDocument();
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.getByText("228")).toBeInTheDocument(); // 2 × 100 + 28 × 1 new enquiries in 30 days
    expect(screen.getByText("6.8%")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument(); // New = NEW + CONTACT_PENDING
    const row = (await screen.findByRole("rowheader", { name: /Priya S\./ })).closest("tr")!;
    expect(within(row).getByText("2")).toHaveClass("text-danger");
    expect(screen.getByRole("link", { name: /Detailed dashboard/ })).toHaveAttribute("href", "/admin/insights");
  });

  it("hides counsellor performance without the team permission", async () => {
    auth.user = { id: "a", name: "Admin", role: "admin", permissions: ["students.read"] };
    vi.mocked(apiGet).mockResolvedValue(summary as never);
    render(<AdminOverview />);
    await screen.findByText("1,248");
    expect(screen.queryByText("Counsellor performance")).toBeNull();
    expect(apiGet).not.toHaveBeenCalledWith("/admin/team/counsellors", expect.anything());
  });

  it("groups the last 28 days into four weeks", () => {
    const w = weeklyTotals(days);
    expect(w.map((x) => x.count)).toEqual([7, 7, 7, 7]);
    expect(w[0]!.from).toBe("2026-10-03");
    expect(w[3]!.to).toBe("2026-10-30");
  });
});

describe("student dashboard (client design)", () => {
  it("shows the latest enquiry with its step, profile completion and the counsellor", async () => {
    auth.user = { id: "s", name: "Ram Kumar", email: "r@example.com", role: "student", permissions: [], emailVerified: true };
    vi.mocked(apiGet).mockImplementation(((path: string) => {
      if (path === "/students/me/profile") return Promise.resolve({ completion: 80, marks: { class12: { percentage: null } } });
      if (path === "/enquiries") return Promise.resolve([{ reference: "ENQ-2026-0042", status: "COUNSELLING_SCHEDULED", statusLabel: "", courses: [{ name: "B.Tech CSE" }], colleges: [{ name: "Sample College" }], createdAt: "", lastActivityAt: "" }]);
      if (path === "/enquiries/ENQ-2026-0042") return Promise.resolve({ counsellor: "Priya S.", callbackRequest: null });
      if (path === "/students/me/recommendations") return Promise.resolve({ items: [], deadlines: [] });
      return Promise.resolve([]);
    }) as never);
    render(<StudentHome />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/, Ram$/);
    expect(await screen.findByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Add your Class 12 marks to unlock eligibility checks.")).toBeInTheDocument();
    expect(await screen.findByText("Counsellor: Priya S.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Your enquiry" })).getByRole("link", { name: "ENQ-2026-0042" })).toHaveAttribute("href", "/student/enquiries/ENQ-2026-0042");
    const steps = screen.getByRole("list", { name: "Admission progress" });
    expect(within(steps).getByText("Counselling").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("maps statuses to milestones and greets by India time", () => {
    expect(milestoneOf("NEW")).toBe(0);
    expect(milestoneOf("OFFER_RECEIVED")).toBe(3);
    expect(milestoneOf("ADMITTED")).toBe(4);
    expect(milestoneOf("ON_HOLD")).toBe(-1);
    expect(greeting(new Date("2026-10-31T09:00:00+05:30"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-31T19:00:00+05:30"))).toBe("Good evening");
  });
});
