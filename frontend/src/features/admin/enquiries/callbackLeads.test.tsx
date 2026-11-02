import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiGet, apiPatch } from "@/services/api";
import CallbackLeads from "./CallbackLeads";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPatch: vi.fn() }));

const lead = { id: "l1", name: "Asha Verma", mobile: "+919876543210", role: "parent", education: "class_12", interest: "B.Tech", status: "new", note: "", requestedAt: "2026-11-01T05:30:00.000Z", contactedAt: null, assignedTo: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockResolvedValue({ data: [lead], meta: { total: 1, totalPages: 1, page: 1, new: 1 } } as never);
  vi.mocked(apiGet).mockResolvedValue([{ id: "c1", name: "Meera", email: "m@example.com", role: "counsellor" }] as never);
  vi.mocked(apiPatch).mockResolvedValue({} as never);
});

describe("callback requests in the Enquiries section", () => {
  it("shows new requests with call actions and lets an admin assign one and update its status", async () => {
    render(<CallbackLeads role="admin" />);
    const row = (await screen.findByText("Asha Verma")).closest("li")!;
    expect(api).toHaveBeenCalledWith("GET", "/admin/callback-leads?limit=10&page=1&status=new", expect.anything());
    expect(within(row).getByText(/Class 12 · Interested in B.Tech/)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Call +919876543210" })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByText("1 new")).toBeInTheDocument();

    await userEvent.selectOptions(within(row).getByLabelText("Assigned to"), "c1");
    expect(apiPatch).toHaveBeenCalledWith("/admin/callback-leads/l1", { assignedTo: "c1" });
    await userEvent.selectOptions(within(row).getByLabelText("Status"), "contacted");
    expect(apiPatch).toHaveBeenCalledWith("/admin/callback-leads/l1", { status: "contacted" });
  });

  it("gives counsellors their own list without the assign control", async () => {
    render(<CallbackLeads role="counsellor" />);
    const row = (await screen.findByText("Asha Verma")).closest("li")!;
    expect(api).toHaveBeenCalledWith("GET", "/counsellor/callback-leads?limit=10&page=1&status=new", expect.anything());
    expect(within(row).queryByLabelText("Assigned to")).toBeNull();
    await userEvent.type(within(row).getByLabelText("Note for the team"), "Call after 6 pm");
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));
    expect(apiPatch).toHaveBeenCalledWith("/counsellor/callback-leads/l1", { note: "Call after 6 pm" });
  });
});
