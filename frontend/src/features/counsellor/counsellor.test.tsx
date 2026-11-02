import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCounsellors from "@/features/admin/AdminCounsellors";
import { reportQueries } from "@/features/admin/EnquiryReports";
import { socialLinksOf } from "@/features/content/SocialLinks";
import { waHref, waNumber } from "@/lib/whatsapp";
import { api, apiGet, apiPost } from "@/services/api";
import type { CounsellorEnquiry } from "@/types/enquiry";
import { CounsellorEnquiryList, CounsellorEnquiryView } from "./CounsellorEnquiries";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, usePathname: () => "/counsellor/enquiries", useRouter: () => ({ push: vi.fn(), replace: nav.replace }), useParams: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
});

describe("WhatsApp and social links", () => {
  it("builds wa.me links with the country code and digits only", () => {
    expect(waNumber("98765 43210")).toBe("919876543210");
    expect(waNumber("098765-43210")).toBe("919876543210");
    expect(waNumber("+91 98765 43210")).toBe("919876543210");
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
    expect(waNumber("12345")).toBeNull();
    expect(waHref("9876543210")).toBe("https://wa.me/919876543210");
  });

  it("shows only https Instagram/Facebook pages and a valid WhatsApp number", () => {
    const links = socialLinksOf({ name: "", supportEmail: "", supportPhone: "", address: "", officeHours: "", whatsapp: "98765 43210", instagram: "https://instagram.com/edupath", facebook: "javascript:alert(1)" });
    expect(links.map(([k]) => k)).toEqual(["instagram", "whatsapp"]);
    expect(links[1]![2]).toBe("https://wa.me/919876543210");
  });
});

const row = { id: "e1", reference: "ENQ-2026-000001", status: "CONTACTED", studentName: "Priya Sharma", studentEmail: "p@example.com", studentMobile: "+919876543210", place: "Chennai", courses: ["B.Tech"], colleges: ["Alpha"], assignedTo: "Meera", source: "direct", callbackTime: "any", callbackRequested: false, lastContactAt: null, followUpAt: "2026-10-01T04:30:00.000Z", followUpDue: true, createdAt: "2026-09-01T00:00:00.000Z", lastActivityAt: "2026-09-01T00:00:00.000Z" };

describe("counsellor screens", () => {
  it("lists only my enquiries with call and WhatsApp buttons and quick filters", async () => {
    nav.params = new URLSearchParams("quick=overdue");
    vi.mocked(api).mockResolvedValue({ data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(<CounsellorEnquiryList />);
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("GET", expect.stringMatching(/^\/counsellor\/enquiries\?sort=follow_up&page=1&quick=overdue$/), expect.anything());
    expect(screen.getByRole("link", { name: /Chat on WhatsApp with \+919876543210/ })).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(screen.getByRole("link", { name: "Call +919876543210" })).toHaveAttribute("href", "tel:+919876543210");
    await userEvent.click(screen.getByRole("button", { name: "Today’s calls" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/counsellor/enquiries?quick=today", { scroll: false });
  });

  it("shows marks and eligibility, and recommends the chosen courses to the student", async () => {
    vi.mocked(apiPost).mockResolvedValue({});
    const e = {
      id: "e1",
      reference: "ENQ-2026-000001",
      status: "CONTACTED",
      statusLabel: "In touch with you",
      allowedTransitions: ["ELIGIBILITY_CHECK", "COUNSELLING_COMPLETED", "CLOSED"],
      student: { id: "s1", name: "Priya Sharma", email: "p@example.com", mobile: "+919876543210", city: "Chennai", state: "Tamil Nadu", qualification: "class_12", percentage: 82, passingYear: 2025, entranceExams: [] },
      academics: { highestQualification: "class_12", percentage: 82, marks: { class10: 91, class12: 82, graduation: null }, entranceExams: [], stream: "PCM", graduationDegree: "", exams: [] },
      eligibility: [
        { offeringId: "o1", courseName: "B.Tech", courseSlug: "btech-be", specialization: "", collegeName: "Alpha Institute", collegeSlug: "alpha", place: "Noida", eligibility: "eligible", reasons: ["Class 12 marks 82% meet the minimum 75%"] },
        { offeringId: "o2", courseName: "B.Tech", courseSlug: "btech-be", specialization: "CSE", collegeName: "Beta College", collegeSlug: "beta", place: "Pune", eligibility: "not_eligible", reasons: ["Class 12 marks 82% are below the minimum 90%"] },
      ],
      preferences: { courses: [{ id: "c1", name: "B.Tech", slug: "btech-be" }], colleges: [], locations: [], budgetMinor: null, counsellingRequest: "Needs hostel", entranceExamNotes: "" },
      timeline: [],
      callbackTime: "any",
      callbackRequest: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      lastContactAt: null,
      followUpAt: null,
    } as unknown as CounsellorEnquiry;
    render(<CounsellorEnquiryView e={e} reload={vi.fn()} />);
    expect(screen.getByText(/Class 10: 91% · Class 12: 82%/)).toBeInTheDocument();
    expect(screen.getByText("Needs hostel")).toBeInTheDocument();
    expect(screen.getByText("Eligible")).toBeInTheDocument();
    expect(screen.getByText("Not eligible")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Recommend B.Tech at Alpha Institute" }));
    await userEvent.type(screen.getByLabelText(/Note to the student/), "Good fit");
    await userEvent.click(screen.getByRole("button", { name: "Recommend 1 course" }));
    expect(apiPost).toHaveBeenCalledWith("/counsellor/enquiries/e1/recommendations", { offerings: ["o1"], note: "Good fit" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Move to" }), "ELIGIBILITY_CHECK");
    await userEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(apiPost).toHaveBeenLastCalledWith("/counsellor/enquiries/e1/status", { fromStatus: "CONTACTED", toStatus: "ELIGIBILITY_CHECK", reason: "", studentMessage: "" });
  });
});

describe("admin counsellors and reports", () => {
  it("lists counsellors with their performance and asks before deactivating", async () => {
    vi.mocked(apiGet).mockResolvedValue([{ id: "u1", name: "Meera Nair", email: "meera@example.com", mobile: null, role: "counsellor", permissions: [], emailVerified: true, status: "active", createdAt: null, lastLoginAt: "2026-10-01T00:00:00.000Z", stats: { assigned: 4, contacted: 2, pending: 1, converted: 1, closed: 0, overdue: 2, conversionRate: 25 } }]);
    vi.mocked(apiPost).mockResolvedValue({});
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminCounsellors />);
    const row = within((await screen.findByText(/Meera Nair/)).closest("tr")!);
    expect(row.getByRole("link", { name: "4" })).toHaveAttribute("href", "/admin/enquiries?assigned=u1");
    expect(row.getByText("25")).toBeInTheDocument();
    await userEvent.click(row.getByRole("button", { name: "Deactivate" }));
    expect(confirm).toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith("/admin/team/counsellors/u1/deactivate");
  });

  it("uses the same filters for the report and the CSV export", () => {
    const q = reportQueries({ from: "2026-10-01", to: "", counsellor: "u1", college: "", course: "c1", status: "NEW" });
    expect(q.report).toBe("from=2026-10-01T00%3A00%3A00%2B05%3A30&counsellor=u1&course=c1&status=NEW");
    expect(q.list).toBe("from=2026-10-01T00%3A00%3A00%2B05%3A30&assigned=u1&course=c1&status=NEW&sort=newest");
  });
});
