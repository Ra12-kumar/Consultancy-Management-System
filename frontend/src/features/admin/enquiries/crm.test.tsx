import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarList } from "@/features/admin/Charts";
import { imageProblem, move } from "@/features/admin/catalog/CollegeGallery";
import CallbackRequest from "@/features/enquiry/CallbackRequest";
import { leadFrom } from "@/features/enquiry/EnquiryForm";
import { api, apiPost } from "@/services/api";
import type { AdminEnquiryRow } from "@/types/enquiry";
import { AdminEnquiryList } from "./AdminEnquiries";
import PhoneActions, { telHref } from "./PhoneActions";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useParams: () => ({}), usePathname: () => "/admin/enquiries", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const auth = vi.hoisted(() => ({ permissions: ["enquiries.manage", "reports.export"] }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "a1", role: "admin", permissions: auth.permissions }, status: "signedIn" }) }));

const row: AdminEnquiryRow = {
  id: "e1",
  reference: "ENQ-2026-000001",
  status: "NEW",
  studentName: "Priya Sharma",
  studentEmail: "priya@example.com",
  studentMobile: "+919876543210",
  place: "Chennai, Tamil Nadu",
  courses: ["B.Tech"],
  colleges: ["Alpha Institute"],
  assignedTo: null,
  source: "featured_college",
  callbackTime: "evening",
  callbackRequested: true,
  lastContactAt: null,
  followUpAt: null,
  followUpDue: false,
  createdAt: "2026-10-28T10:00:00.000Z",
  lastActivityAt: "2026-10-28T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  auth.permissions = ["enquiries.manage", "reports.export"];
});

describe("calling students", () => {
  it("offers a tel: link and copies the number", async () => {
    expect(telHref("+91 98765-43210")).toBe("tel:+919876543210");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PhoneActions mobile="+919876543210" />);
    expect(screen.getByRole("link", { name: "Call +919876543210" })).toHaveAttribute("href", "tel:+919876543210");
    await userEvent.click(screen.getByRole("button", { name: "Copy +919876543210" }));
    expect(writeText).toHaveBeenCalledWith("+919876543210");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

describe("admin enquiry list", () => {
  it("shows phone, college, source and callback requests; quick filters and export use the same filters", async () => {
    nav.params = new URLSearchParams("quick=today");
    vi.mocked(api).mockResolvedValue({ data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(<AdminEnquiryList />);
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("GET", "/admin/enquiries?quick=today&sort=newest", expect.anything());
    const table = within(screen.getByRole("table"));
    expect(table.getByRole("link", { name: "Call +919876543210" })).toBeInTheDocument();
    expect(table.getByText("Alpha Institute")).toBeInTheDocument();
    expect(table.getByText("Featured college")).toBeInTheDocument();
    expect(table.getByText("Callback requested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today’s calls" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/admin/enquiries/export?quick=today&sort=newest");

    await userEvent.click(screen.getByRole("button", { name: "Callback requests" }));
    expect(api).toHaveBeenLastCalledWith("GET", "/admin/enquiries?quick=callback&sort=newest", expect.anything());
  });

  it("hides the export without reports.export", async () => {
    auth.permissions = ["enquiries.manage"];
    vi.mocked(api).mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    render(<AdminEnquiryList />);
    expect(await screen.findByText("No enquiries match")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
  });
});

describe("helpers", () => {
  it("reads the lead source from the link and ignores unknown values", () => {
    expect(leadFrom(new URLSearchParams("source=featured_college"))).toEqual({ source: "featured_college", campaign: "" });
    expect(leadFrom(new URLSearchParams("source=evil<script>"))).toEqual({ source: "direct", campaign: "" });
    expect(leadFrom(new URLSearchParams("utm_campaign=diwali<b>2026"))).toEqual({ source: "campaign", campaign: "diwalib2026" });
  });

  it("checks photo files and moves gallery items", () => {
    expect(imageProblem(new File(["x"], "a.exe", { type: "application/x-msdownload" }))).toMatch(/JPEG, PNG or WebP/);
    expect(imageProblem(new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }))).toMatch(/5 MB/);
    expect(imageProblem(new File(["x"], "ok.webp", { type: "image/webp" }))).toBeNull();
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("draws bars with their values as text", () => {
    render(<BarList title="Enquiries by status" rows={[{ label: "New", value: 4 }, { label: "Interested", value: 2 }]} />);
    expect(screen.getByText("Enquiries by status").tagName).toBe("FIGCAPTION");
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByTitle("Interested: 2")).toBeInTheDocument();
  });
});

describe("callback request", () => {
  it("sends the request for the enquiry and shows it as pending", async () => {
    vi.mocked(apiPost).mockResolvedValue({ reference: "ENQ-2026-000001" });
    const onDone = vi.fn();
    render(<CallbackRequest reference="ENQ-2026-000001" current={null} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Request a callback or session" }));
    await userEvent.selectOptions(screen.getByLabelText(/Preferred time/), "evening");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(apiPost).toHaveBeenCalledWith("/enquiries/ENQ-2026-000001/callback-request", { kind: "callback", preferredDate: null, slot: "evening", mode: "phone", note: "" });
    expect(onDone).toHaveBeenCalled();
  });
});
