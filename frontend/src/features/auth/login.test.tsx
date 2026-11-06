import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "@/services/api";
import { AuthProvider } from "./AuthProvider";
import UdanLogin from "./UdanLogin";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn(), apiPost: vi.fn() }));
const nav = vi.hoisted(() => ({ go: vi.fn(), params: new URLSearchParams("next=/student/enquiries") }));
vi.mock("@/lib/navigation", () => ({ hardNavigate: nav.go }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, usePathname: () => "/login", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const student = { id: "s1", name: "Ravi", email: "ravi@example.com", role: "student", permissions: [], emailVerified: true };
const renderLogin = () =>
  render(
    <AuthProvider>
      <UdanLogin />
    </AuthProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockRejectedValue({ status: 401 });
});

describe("sign-in page (Udaan design)", () => {
  it("signs in with the same request as before and goes to the ?next= page", async () => {
    vi.mocked(apiPost).mockResolvedValue({ user: student });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/^Email/), " ravi@example.com ");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/login", { email: "ravi@example.com", password: "Str0ng-pass-2026" });
    expect(nav.go).toHaveBeenCalledWith("/student/enquiries");
  });

  it("checks the fields first, shows server errors, and asks for the code when two-step sign-in is on", async () => {
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/email/i);
    expect(apiPost).not.toHaveBeenCalled();

    vi.mocked(apiPost).mockResolvedValueOnce({ mfaRequired: true, challenge: "ch1" }).mockResolvedValueOnce({ user: { ...student, role: "admin" } });
    await userEvent.type(screen.getByLabelText(/^Email/), "admin@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await userEvent.type(await screen.findByLabelText(/^Authentication code/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(apiPost).toHaveBeenLastCalledWith("/auth/mfa/verify", { challenge: "ch1", code: "123456" });
  });

  it("sends unverified accounts to the email-code page", async () => {
    vi.mocked(apiPost).mockRejectedValue({ status: 403, code: "EMAIL_NOT_VERIFIED", message: "Verify your email" });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/^Email/), "new@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(nav.go).toHaveBeenCalledWith("/verify-email?sent=1&email=new%40example.com");
  });
});
