import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/AuthProvider";
import LoginForm from "@/features/auth/LoginForm";
import ContentPage from "@/features/content/ContentPage";
import { StudentPayments } from "@/features/payments/StudentPayments";
import { SafeMarkdown } from "@/lib/markdown";
import { apiGet, apiPost } from "@/services/api";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn(), apiPost: vi.fn() }));
const push = vi.fn();
const hardNavigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation", () => ({ hardNavigate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }), usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

beforeEach(() => vi.clearAllMocks());

describe("safe markdown", () => {
  it("renders headings, lists and https links, and never HTML or script links", () => {
    const { container } = render(<SafeMarkdown text={"## Your data\n\n- Name\n- **Email**\n\nSee [our policy](https://example.com/p) or [bad](javascript:alert(1)).\n\n<script>alert(1)</script><img src=x onerror=alert(1)>"} />);
    expect(screen.getByRole("heading", { level: 2, name: "Your data" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "our policy" })).toHaveAttribute("href", "https://example.com/p");
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument();
    expect(container.querySelector("script, img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("two-step sign-in", () => {
  it("asks for the authenticator code after a correct password, then signs in", async () => {
    vi.mocked(apiGet).mockRejectedValue({ status: 401 });
    vi.mocked(apiPost).mockImplementation(async (path: string) => {
      if (path === "/auth/login") return { mfaRequired: true, challenge: "c".repeat(43) };
      if (path === "/auth/mfa/verify") return { user: { id: "a1", name: "Asha", email: "a@x.in", mobile: null, role: "admin", permissions: [], emailVerified: true, status: "active", createdAt: null, lastLoginAt: null, mfaEnabled: true } };
      return {};
    });
    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>,
    );
    await userEvent.type(screen.getByLabelText(/^Email/), "a@x.in");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const code = await screen.findByLabelText(/Authentication code/);
    expect(hardNavigate).not.toHaveBeenCalled();
    await userEvent.type(code, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(apiPost).toHaveBeenLastCalledWith("/auth/mfa/verify", { challenge: "c".repeat(43), code: "123456" });
    expect(hardNavigate).toHaveBeenCalledWith("/admin");
  });
});

describe("editable pages and payments", () => {
  it("shows the admin's saved page, or the built-in text when none is saved", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ slug: "privacy", title: "Our privacy promise", intro: "Short version.", body: "## Rights\n- Access", faqs: [], updatedAt: "2026-10-28T00:00:00.000Z" });
    const { unmount } = render(<ContentPage slug="privacy" fallback={{ eyebrow: "Privacy", title: "Privacy policy", intro: "x", points: ["a"] }} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Our privacy promise" })).toBeInTheDocument();
    unmount();
    vi.mocked(apiGet).mockRejectedValueOnce({ status: 404 });
    render(<ContentPage slug="privacy" fallback={{ eyebrow: "Privacy", title: "Privacy policy", intro: "Built-in", points: ["We do not sell data"] }} />);
    expect(await screen.findByText("We do not sell data")).toBeInTheDocument();
  });

  it("students see what to pay; the pay button appears only when online payment is on", async () => {
    vi.mocked(apiGet).mockResolvedValue({ enabled: false, payments: [{ reference: "PAY-2026-000001", id: "p1", description: "Consultancy service charge", amountMinor: 1_000_000, status: "requested", receiptNumber: null, paidAt: null, razorpayPaymentId: null, createdAt: "2026-10-28T00:00:00.000Z" }] });
    render(<StudentPayments />);
    expect(await screen.findByText("₹10,000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay now" })).not.toBeInTheDocument();
    expect(screen.getByText(/Online payment is not available yet/)).toBeInTheDocument();
  });
});
