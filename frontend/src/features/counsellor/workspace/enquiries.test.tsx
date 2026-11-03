import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "@/test/setup";
import { api, apiGet, apiPatch } from "@/services/api";
import CallbackPanel from "./CallbackPanel";
import EnquiriesTable from "./EnquiriesTable";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPatch: vi.fn() }));

const iso = new Date().toISOString();
const row = { id: "e1", reference: "ENQ-2026-000011", status: "NEW", studentName: "Ram", studentEmail: "ram@example.com", studentMobile: "+917323891747", place: "", courses: ["B.Tech / B.E."], colleges: [], assignedTo: "Pradeep", source: "home", callbackTime: "any", callbackRequested: false, lastContactAt: null, followUpAt: null, followUpDue: false, createdAt: iso, lastActivityAt: iso };
const lead = { id: "l1", name: "Ram", mobile: "+917323891747", role: "student", education: "class_12", interest: "Engineering", status: "new", note: "", requestedAt: iso, contactedAt: null, assignedTo: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockImplementation(((path: string) => Promise.resolve(path === "/courses" ? [{ id: "c1", name: "B.Tech / B.E." }] : { assignedOpen: 12, assignedTotal: 12, converted: 11, followUpsToday: 8, followUpsOverdue: 3 })) as never);
  vi.mocked(api).mockImplementation(((_m: string, path: string) =>
    Promise.resolve(path.startsWith("/counsellor/callback-leads") ? { data: [lead], meta: { total: 1, totalPages: 1, page: 1, new: 1 } } : { data: [row], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } })) as never);
  vi.mocked(apiPatch).mockResolvedValue({} as never);
});

describe("counsellor My Enquiries (client design)", () => {
  it("shows website callback requests with call actions and saves status and note together", async () => {
    render(<CallbackPanel />);
    expect(await screen.findByText("1 New")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call Ram" })).toHaveAttribute("href", "tel:+917323891747");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "contacted");
    await userEvent.type(screen.getByLabelText("Note for the team"), "Call after 6 pm");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiPatch).toHaveBeenCalledWith("/counsellor/callback-leads/l1", { status: "contacted", note: "Call after 6 pm" });
  });

  it("lists assigned enquiries with tab counts, filters through the URL and contact actions", async () => {
    render(<EnquiriesTable />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Home page")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Overdue\s*3/ })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Email Ram" }).getAttribute("href")).toMatch(/^mailto:ram@example\.com/);
    await userEvent.click(screen.getByRole("tab", { name: /Follow-ups/ }));
    expect(router.replace).toHaveBeenLastCalledWith("/?quick=today", { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText("Course"), "c1");
    expect(router.replace).toHaveBeenLastCalledWith("/?course=c1", { scroll: false });
  });
});
