import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminScholarshipApplications, scholarshipPayload } from "@/features/admin/scholarships/AdminScholarships";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { api, apiGet, apiPost } from "@/services/api";
import type { User } from "@/types/api";
import type { AdminScholarshipApplication, Scholarship } from "@/types/scholarship";
import { ScholarshipDetail, benefitText } from "./Scholarships";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/scholarships/alpha-merit", useSearchParams: () => new URLSearchParams(), useParams: () => ({ slug: "alpha-merit" }) }));

const student: User = { id: "u1", name: "Priya Sharma", email: "priya@example.com", mobile: null, role: "student", permissions: [], emailVerified: true, status: "active", createdAt: null, lastLoginAt: null };
const scholarship: Scholarship = {
  id: "s1",
  name: "Alpha Merit Scholarship",
  slug: "alpha-merit",
  providerType: "college",
  providerName: "Alpha Institute",
  college: { name: "Alpha Institute", slug: "alpha" },
  description: "",
  benefit: { type: "tuition_percent", value: 25, maxMinor: 5_000_000, description: "" },
  eligibility: { courses: [], minPercentage: 80, maxFamilyIncomeMinor: 80_000_000, states: [], categories: [], genders: [], notes: "" },
  documentsRequired: ["Marksheet"],
  academicYear: "2026-27",
  applicationDeadline: null,
  open: true,
  officialUrl: null,
  sourceRef: "",
  lastVerifiedAt: "2026-10-01T00:00:00.000Z",
  isSample: false,
};

beforeEach(() => vi.clearAllMocks());

describe("scholarships", () => {
  it("describes benefits and converts the admin form to paise", () => {
    expect(benefitText(scholarship.benefit)).toBe("25% of tuition (up to ₹50,000)");
    expect(benefitText({ type: "service_charge_percent", value: 50, maxMinor: null, description: "" })).toBe("50% off the EduPath service charge");
    const body = scholarshipPayload({
      name: "Need grant", slug: "need-grant", providerType: "consultancy", providerName: "EduPath", college: "c1", description: "",
      benefitType: "fixed_amount", benefitValue: "40,000", benefitMax: "", benefitDescription: "", courses: [], minPercentage: "60", maxIncome: "6,00,000",
      states: [], categories: ["sc"], genders: [], notes: "", documents: "Income certificate, Marksheet", academicYear: "2026-27", deadline: "", officialUrl: "", sourceRef: "", lastVerifiedAt: "",
    });
    expect(body).toMatchObject({ college: null, benefit: { type: "fixed_amount", value: 4_000_000, maxMinor: null }, eligibility: { minPercentage: 60, maxFamilyIncomeMinor: 60_000_000, categories: ["sc"] }, documentsRequired: ["Income certificate", "Marksheet"] });
  });

  it("a student checks preliminary eligibility (with declared income) and applies", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === "/auth/me") return { user: student };
      if (path === "/scholarships/alpha-merit") return scholarship;
      if (path.startsWith("/scholarships/alpha-merit/eligibility")) {
        return { preliminary: true, facts: { percentage: 85, state: null, courses: [] }, results: [{ scholarship, result: "likely_eligible", reasons: [{ rule: "percentage", ok: true, message: "Your 85% meets the 80% minimum" }] }] };
      }
      return null;
    });
    vi.mocked(apiPost).mockResolvedValue({ reference: "SCH-2026-000003" });
    render(
      <AuthProvider>
        <ScholarshipDetail />
      </AuthProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Alpha Merit Scholarship" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Annual family income (₹)"), "5,00,000");
    await userEvent.click(screen.getByRole("button", { name: "Check eligibility" }));
    expect(apiGet).toHaveBeenCalledWith("/scholarships/alpha-merit/eligibility?familyIncomeMinor=50000000");
    expect(await screen.findByText("Likely eligible")).toBeInTheDocument();
    expect(screen.getByText("Preliminary – not a decision")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply for this scholarship" }));
    expect(apiPost).toHaveBeenCalledWith("/scholarship-applications", { scholarship: "s1", statement: "", familyIncomeMinor: 50_000_000 });
    expect(await screen.findByText("Application SCH-2026-000003 submitted")).toBeInTheDocument();
  });

  it("reviewers without scholarships.approve cannot see approve or reject", async () => {
    const reviewer: User = { ...student, role: "admin", permissions: ["scholarships.manage"] };
    vi.mocked(apiGet).mockResolvedValue({ user: reviewer });
    const app: AdminScholarshipApplication = {
      id: "a1", reference: "SCH-2026-000003", scholarshipName: "Alpha Merit Scholarship", scholarship: "s1", status: "submitted", statusLabel: "Submitted",
      preliminary: { result: "likely_eligible", reasons: [] }, declared: { familyIncomeMinor: null, category: null, gender: null }, statement: "", decision: null,
      history: [], createdAt: "2026-10-01T00:00:00.000Z", student: { id: "u1", name: "Priya Sharma", email: "priya@example.com", percentage: 85, state: "Tamil Nadu" }, enquiry: null, internalNote: "", decisionBy: null,
    };
    vi.mocked(api).mockResolvedValue({ data: [app], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(
      <AuthProvider>
        <AdminScholarshipApplications />
      </AuthProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Alpha Merit Scholarship/ }));
    expect(screen.getByRole("button", { name: "Mark under review" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/needs the “Approve scholarships” permission/)).toBeInTheDocument();
  });
});
