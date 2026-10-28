import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReports } from "@/features/admin/support/AdminSupport";
import { AuthProvider } from "@/features/auth/AuthProvider";
import HomeLive from "@/features/home/HomeLive";
import { api, apiGet, apiPost, apiUpload } from "@/services/api";
import type { User } from "@/types/api";
import { DataRequestsCard, FeedbackScreen, PhotoCard } from "./StudentSupport";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn(), apiUpload: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

const student: User = { id: "u1", name: "Priya Sharma", email: "priya@example.com", mobile: null, role: "student", permissions: [], emailVerified: true, status: "active", createdAt: null, lastLoginAt: null, photoUrl: null };
beforeEach(() => vi.clearAllMocks());

describe("student support", () => {
  it("rejects oversized photos before uploading", async () => {
    vi.mocked(apiGet).mockResolvedValue({ user: student });
    render(
      <AuthProvider>
        <PhotoCard />
      </AuthProvider>,
    );
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "me.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Choose a profile photo"), big);
    expect(screen.getByText("Choose a photo smaller than 2 MB")).toBeInTheDocument();
    expect(apiUpload).not.toHaveBeenCalled();
  });

  it("a deletion request needs an explicit confirmation", async () => {
    vi.mocked(apiGet).mockResolvedValue([]);
    vi.mocked(apiPost).mockResolvedValue({ reference: "DRQ-2026-000001" });
    render(<DataRequestsCard />);
    await userEvent.selectOptions(screen.getByLabelText("What would you like?"), "deletion");
    const send = screen.getByRole("button", { name: "Send request" });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(send);
    expect(apiPost).toHaveBeenCalledWith("/students/me/data-requests", { type: "deletion", details: "" });
    expect(await screen.findByText(/Request DRQ-2026-000001 sent/)).toBeInTheDocument();
  });

  it("feedback needs a rating and a message; publishing consent is opt-in", async () => {
    vi.mocked(apiGet).mockResolvedValue([]);
    vi.mocked(apiPost).mockResolvedValue({});
    render(<FeedbackScreen />);
    const send = await screen.findByRole("button", { name: "Send feedback" });
    await userEvent.type(screen.getByLabelText(/Your message/), "Very helpful counselling");
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    await userEvent.click(send);
    expect(apiPost).toHaveBeenCalledWith("/feedback", { rating: 4, category: "service", message: "Very helpful counselling", publishConsent: false });
  });
});

describe("admin reports", () => {
  it("exports leave out personal data unless ticked, and warn when included", async () => {
    vi.mocked(api).mockResolvedValue({
      data: { range: {}, definitions: { conversion: "x", fees: "y" }, registrations: [], enquiries: { total: 0, byStatus: {}, byCourse: [], byState: [], byCollege: [], conversion: { confirmedAdmissions: 0, rate: 0 }, pendingFollowUps: 0 }, applications: {}, scholarships: { byStatus: {}, approvedAwardsMinor: 0 }, fees: [], emailFailures: [] },
    });
    render(<AdminReports />);
    const link = await screen.findByRole("link", { name: "Download CSV" });
    expect(link.getAttribute("href")).not.toMatch(/studentEmail/);
    expect(screen.queryByText(/includes personal data/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/studentEmail/));
    expect(link.getAttribute("href")).toMatch(/studentEmail/);
    expect(screen.getByText(/includes personal data/)).toBeInTheDocument();
  });
});

describe("home page live content", () => {
  it("shows only approved testimonials and hides empty sections", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === "/auth/me") throw { status: 401 };
      if (path === "/testimonials") return [{ id: "t1", rating: 5, quote: "Clear advice at every step.", name: "Priya, Chennai" }];
      return [];
    });
    render(
      <AuthProvider>
        <HomeLive />
      </AuthProvider>,
    );
    expect(await screen.findByText("“Clear advice at every step.”")).toBeInTheDocument();
    expect(screen.getByText("Priya, Chennai")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Featured colleges" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Scholarships open now" })).not.toBeInTheDocument();
  });
});
