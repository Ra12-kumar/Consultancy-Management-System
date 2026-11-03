import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiGet } from "@/services/api";
import CounsellorDashboard from "./CounsellorDashboard";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "c1", name: "Pradeep Kumar", email: "p@example.com", role: "counsellor", permissions: [] } }) }));

const today = new Date(Date.now() + 2 * 3600e3).toISOString();
const row = { id: "e1", reference: "ENQ-2026-000011", status: "CONTACTED", studentName: "Asha Verma", studentEmail: "asha@example.com", studentMobile: "+919876543210", place: "Pune", courses: ["B.Tech / B.E."], colleges: [], assignedTo: "Pradeep Kumar", source: "direct", callbackTime: "any", callbackRequested: false, lastContactAt: null, followUpAt: today, followUpDue: false, createdAt: today, lastActivityAt: today };
const lead = { id: "l1", name: "Ram", mobile: "+917323891747", role: "student", education: "class_12", interest: "", status: "new", note: "", requestedAt: today, contactedAt: null, assignedTo: null };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(apiGet).mockResolvedValue({ assignedOpen: 12, assignedTotal: 28, converted: 12, followUpsToday: 1, followUpsOverdue: 0 } as never);
  vi.mocked(api).mockImplementation(((_m: string, path: string) => {
    if (path.startsWith("/counsellor/callback-leads")) return Promise.resolve({ data: [lead], meta: { total: 1, new: 1 } });
    if (path.includes("from=")) return Promise.resolve({ data: [], meta: { total: 2 } });
    if (path.includes("quick=overdue")) return Promise.resolve({ data: [], meta: { total: 0 } });
    return Promise.resolve({ data: [row], meta: { total: 1 } });
  }) as never);
});

describe("counsellor dashboard", () => {
  it("shows live counts, the 7-day trend, today's tasks and contact actions for the next student", async () => {
    render(<CounsellorDashboard />);
    expect(await screen.findByText("Total Enquiries")).toBeInTheDocument();
    expect(await screen.findByText("+14 in 7 days")).toBeInTheDocument(); // 7 days × 2
    expect(screen.getByText("43%")).toBeInTheDocument(); // 12 of 28 admitted
    // Each day is counted with the existing date filter (from/to), in India time.
    expect(vi.mocked(api).mock.calls.filter(([, p]) => (p as string).includes("from=")).length).toBe(7);
    const tasks = screen.getByRole("region", { name: "Today’s Tasks" });
    expect(within(tasks).getByText("Call back Ram (+917323891747)")).toBeInTheDocument();
    expect(within(tasks).getByText("Follow up with Asha Verma")).toBeInTheDocument();
    await userEvent.click(within(tasks).getByRole("checkbox", { name: /Follow up with Asha Verma/ }));
    expect(JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]!)!)).toEqual(["enq:e1"]);
    expect(screen.getByRole("link", { name: /Call Student/ })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("link", { name: /Send Email/ }).getAttribute("href")).toMatch(/^mailto:asha@example\.com/);
  });
});
