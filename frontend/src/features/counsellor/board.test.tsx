import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiGet } from "@/services/api";
import MyEnquiriesBoard, { followUpLabel } from "./MyEnquiriesBoard";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, usePathname: () => "/counsellor/enquiries", useRouter: () => ({ push: vi.fn(), replace: nav.replace }) }));

const row = { id: "e1", reference: "ENQ-2026-0042", status: "COUNSELLING_SCHEDULED", studentName: "Priya Sharma", studentEmail: "p@example.com", studentMobile: "9876543210", place: "Pune", courses: ["B.Tech CSE"], colleges: [], assignedTo: "Me", source: "direct", callbackTime: "any", callbackRequested: false, lastContactAt: null, followUpAt: null, followUpDue: false, createdAt: "2026-10-01T00:00:00.000Z", lastActivityAt: "2026-10-01T00:00:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  vi.mocked(apiGet).mockResolvedValue({ assignedOpen: 20, assignedTotal: 24, converted: 7, followUpsToday: 5, followUpsOverdue: 2 } as never);
  vi.mocked(api).mockResolvedValue({ data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } as never);
});

describe("counsellor My enquiries board", () => {
  it("shows the four counts and a row with Call, WhatsApp and Notes", async () => {
    render(<MyEnquiriesBoard />);
    expect(screen.getByText("Only enquiries assigned to you are shown.")).toBeInTheDocument();
    const counts = screen.getByRole("group", { name: /Enquiry counts/ });
    expect(await within(counts).findByText("24")).toBeInTheDocument();
    for (const n of ["5", "2", "7"]) expect(within(counts).getByText(n)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("link", { name: "ENQ-2026-0042" })).toHaveAttribute("href", "/counsellor/enquiries/e1");
    expect(within(table).getByRole("link", { name: "Call Priya Sharma" })).toHaveAttribute("href", "tel:9876543210");
    expect(within(table).getByRole("link", { name: "Chat on WhatsApp with Priya Sharma" })).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(within(table).getByRole("link", { name: "Notes for ENQ-2026-0042" })).toHaveAttribute("href", "/counsellor/enquiries/e1");
    expect(screen.getByText("Internal notes are never shown to students.")).toBeInTheDocument();
  });

  it("filters by a count card through the URL", async () => {
    render(<MyEnquiriesBoard />);
    await userEvent.click(screen.getByRole("button", { name: /Overdue/ }));
    expect(nav.replace).toHaveBeenCalledWith("/counsellor/enquiries?quick=overdue", { scroll: false });
  });

  it("labels follow-ups in India time", () => {
    const now = new Date("2026-10-31T10:00:00+05:30");
    expect(followUpLabel("2026-10-31T18:00:00+05:30", now)).toEqual({ text: "Today", overdue: false });
    expect(followUpLabel("2026-10-29T09:00:00+05:30", now)).toEqual({ text: "Overdue 2 days", overdue: true });
    expect(followUpLabel("2026-11-03T09:00:00+05:30", now).text).toBe("3 Nov");
    expect(followUpLabel(null, now).text).toBe("—");
  });
});
