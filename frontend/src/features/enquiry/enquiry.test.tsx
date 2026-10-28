import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusPanel } from "@/features/admin/enquiries/AdminEnquiries";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { apiGet, apiPost } from "@/services/api";
import type { User } from "@/types/api";
import type { AdminEnquiry, StudentEnquiry } from "@/types/enquiry";
import EnquiryForm, { enquiryPayload, validateStep } from "./EnquiryForm";
import { EnquiryView } from "./StudentEnquiries";
import { istInputToIso, isoToIstInput, reasonRequired } from "./shared";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/enquire", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

const student: User = { id: "u1", name: "Priya Sharma", email: "priya@example.com", mobile: "+919876543210", role: "student", permissions: [], emailVerified: true, status: "active", createdAt: null, lastLoginAt: null };
const profile = {
  personal: { city: "Chennai", state: "Tamil Nadu", guardianName: "", guardianPhone: "", preferredContact: "email" },
  academic: { highestQualification: "class_12", course: "PCM", institution: "", boardOrUniversity: "", passingYear: 2025, score: null, entranceExams: [], percentage: 82 },
  completion: 100,
  updatedAt: null,
};

function api(user: User) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/auth/me") return { user };
    if (path === "/students/me/profile") return profile;
    if (path === "/courses") return [{ id: "k1", name: "B.Tech / B.E.", slug: "btech-be", level: "ug", category: "", typicalDurationMonths: 48, isActive: true, sortOrder: 1 }];
    if (path === "/locations") return [{ id: "l1", name: "Delhi NCR", slug: "delhi-ncr", kind: "region", parents: [], isActive: true, sortOrder: 1 }];
    return [];
  });
}

beforeEach(() => vi.clearAllMocks());

describe("enquiry form", () => {
  it("validates each step and sends only the allowed fields (paise, with an idempotency key)", () => {
    const d = { courses: [], specialization: "", locations: [], colleges: [], institutionTypes: [], budget: "6,00,000", hostel: true, scholarship: false, admissionYear: String(new Date().getFullYear()), intake: "July", entranceExamNotes: "", counsellingRequest: " call me " };
    expect(validateStep(1, d).courses).toBe("Choose at least one course");
    expect(validateStep(2, { ...d, admissionYear: "1999" }).admissionYear).toBeTruthy();
    expect(validateStep(2, { ...d, budget: "lots" }).budget).toBeTruthy();
    const body = enquiryPayload({ ...d, courses: ["k1"], colleges: [{ id: "c1", name: "Alpha", isSample: false }] }, "key-12345678");
    expect(body).toMatchObject({ idempotencyKey: "key-12345678", courses: ["k1"], colleges: ["c1"], budgetMinor: 60_000_000, counsellingRequest: "call me" });
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["status"]));
    expect(body).not.toHaveProperty("reference");
  });

  it("walks the steps, submits once and shows the reference number", async () => {
    api(student);
    vi.mocked(apiPost).mockResolvedValue({ reference: "ENQ-2026-000042", feeEstimates: [], status: "NEW" });
    render(
      <AuthProvider>
        <EnquiryForm />
      </AuthProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one course");
    await userEvent.click(screen.getByRole("button", { name: "B.Tech / B.E." }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));
    expect(apiPost).toHaveBeenCalledTimes(1);
    const [path, body] = vi.mocked(apiPost).mock.calls[0]!;
    expect(path).toBe("/enquiries");
    expect(body).toMatchObject({ courses: ["k1"], idempotencyKey: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/) });
    expect(await screen.findByText("ENQ-2026-000042")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Track this enquiry" })).toHaveAttribute("href", "/student/enquiries/ENQ-2026-000042");
  });

  it("links to the existing enquiry on a duplicate, and asks unverified students to verify first", async () => {
    api(student);
    vi.mocked(apiPost).mockRejectedValue({ status: 409, code: "DUPLICATE_ENQUIRY", message: "duplicate", details: [{ field: "reference", message: "ENQ-2026-000007" }] });
    const { unmount } = render(
      <AuthProvider>
        <EnquiryForm />
      </AuthProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "B.Tech / B.E." }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));
    expect(await screen.findByRole("link", { name: "Open enquiry ENQ-2026-000007" })).toHaveAttribute("href", "/student/enquiries/ENQ-2026-000007");
    unmount();

    api({ ...student, emailVerified: false });
    render(
      <AuthProvider>
        <EnquiryForm />
      </AuthProvider>,
    );
    expect(await screen.findByText("Please verify your email first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });
});

describe("student enquiry view", () => {
  it("shows progress, the student message and the conversation; withdrawing needs a reason", async () => {
    const e: StudentEnquiry = {
      reference: "ENQ-2026-000042",
      status: "DOCUMENTS_PENDING",
      statusLabel: "Documents needed",
      studentMessage: "Please send your marksheet.",
      counsellor: "Ravi Counsellor",
      createdAt: "2026-10-01T10:00:00.000Z",
      lastActivityAt: "2026-10-02T10:00:00.000Z",
      preferences: { courses: [{ id: "k1", name: "B.Tech / B.E.", slug: "btech-be" }], colleges: [], locations: [], specialization: "", institutionTypes: [], budgetMinor: null, hostel: false, scholarship: false, admissionYear: 2026, intake: "", entranceExamNotes: "", counsellingRequest: "" },
      feeEstimates: [],
      documents: [{ id: "d1", name: "Class 12 marksheet", status: "requested", note: "", requestedAt: "2026-10-02T10:00:00.000Z", receivedAt: null, files: [] }],
      timeline: [
        { id: "t1", type: "created", toStatus: "NEW", statusLabel: "Received", body: "Enquiry received.", by: "You", createdAt: "2026-10-01T10:00:00.000Z" },
        { id: "t2", type: "message", toStatus: null, statusLabel: null, body: "Hello from your counsellor", by: "Ravi Counsellor", createdAt: "2026-10-02T09:00:00.000Z" },
      ],
      applications: [],
      appointments: [],
    };
    render(<EnquiryView enquiry={e} reload={() => {}} />);
    const steps = screen.getByRole("list", { name: "Enquiry progress" });
    expect(within(steps).getByText("Documents needed").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Please send your marksheet.")).toBeInTheDocument();
    expect(screen.getByText("Hello from your counsellor")).toBeInTheDocument();
    expect(screen.getByText("Class 12 marksheet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Withdraw this enquiry" }));
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });
});

describe("admin status panel", () => {
  it("offers only the allowed targets and requires a reason where the rules do", async () => {
    const act = vi.fn().mockResolvedValue(true);
    const e = { id: "e1", status: "CONTACTED", statusLabel: "In touch with you", allowedTransitions: ["COUNSELLING_SCHEDULED", "DOCUMENTS_PENDING", "ON_HOLD", "CLOSED"] } as unknown as AdminEnquiry;
    render(<StatusPanel e={e} act={act} />);
    const select = screen.getByLabelText("Move to");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Counselling scheduled", "Documents pending", "On hold", "Closed"]);
    await userEvent.selectOptions(select, "ON_HOLD");
    await userEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(screen.getByText("Give a reason for this change")).toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Internal reason/), "Waiting for results");
    await userEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("mirrors the server's reason rules and converts India time correctly", () => {
    expect(reasonRequired("CONTACTED", "DOCUMENTS_PENDING")).toBe(false);
    expect(reasonRequired("SUBMITTED", "APPLICATION_IN_PROGRESS")).toBe(true);
    expect(reasonRequired("CLOSED", "CONTACTED")).toBe(true);
    expect(new Date(istInputToIso("2026-11-05T16:30")).toISOString()).toBe("2026-11-05T11:00:00.000Z");
    expect(isoToIstInput("2026-11-05T11:00:00.000Z")).toBe("2026-11-05T16:30");
  });
});
