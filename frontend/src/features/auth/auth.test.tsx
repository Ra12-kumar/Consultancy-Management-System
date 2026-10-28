import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteHeader from "@/components/SiteHeader";
import DashboardShell from "@/components/DashboardShell";
import { AuthProvider } from "@/features/auth/AuthProvider";
import RegisterForm, { validateRegistration } from "@/features/auth/RegisterForm";
import StudentDashboard from "@/features/student/StudentDashboard";
import { apiGet, apiPost } from "@/services/api";
import type { User } from "@/types/api";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn(), apiPost: vi.fn() }));

const student: User = { id: "u1", name: "Priya Sharma", email: "priya@example.com", mobile: "+919876543210", role: "student", permissions: [], emailVerified: false, status: "active", createdAt: null, lastLoginAt: null };

beforeEach(() => vi.clearAllMocks());

describe("registration form", () => {
  it("validates every field on the client before sending", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create student account" }));
    expect(screen.getByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid mobile number")).toBeInTheDocument();
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
    expect(validateRegistration({ name: "Priya", email: "p@x.in", mobile: "9876543210", password: "abcdefghij1", confirm: "different1" }).confirm).toBe("The passwords do not match");
  });

  it("sends only the allowed fields (never a role) and shows the check-your-email state", async () => {
    vi.mocked(apiPost).mockResolvedValue({ message: "Account created. Please check your email." });
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/Full name/), "Priya Sharma");
    await userEvent.type(screen.getByLabelText(/^Email/), "priya@example.com");
    await userEvent.type(screen.getByLabelText(/Mobile number/), "98765 43210");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Create student account" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/register", { name: "Priya Sharma", email: "priya@example.com", mobile: "98765 43210", password: "Str0ng-pass-2026" });
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("shows server field errors", async () => {
    vi.mocked(apiPost).mockRejectedValue({ status: 422, code: "VALIDATION_ERROR", message: "Request validation failed", details: [{ field: "mobile", message: "Enter a valid mobile number" }] });
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/Full name/), "Priya Sharma");
    await userEvent.type(screen.getByLabelText(/^Email/), "priya@example.com");
    await userEvent.type(screen.getByLabelText(/Mobile number/), "9876543210");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Create student account" }));
    expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
  });
});

describe("header", () => {
  it("shows Sign in when signed out", async () => {
    vi.mocked(apiGet).mockRejectedValue({ status: 401, code: "UNAUTHORIZED", message: "Please sign in" });
    render(<AuthProvider><SiteHeader /></AuthProvider>);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the profile menu when signed in, and signs out on the server", async () => {
    vi.mocked(apiGet).mockResolvedValue({ user: student });
    vi.mocked(apiPost).mockResolvedValue({ signedOut: true });
    render(<AuthProvider><SiteHeader /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Open account menu/ }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Dashboard" })).toHaveAttribute("href", "/student");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/logout");
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("has a working mobile menu button", async () => {
    vi.mocked(apiGet).mockRejectedValue({ status: 401 });
    render(<AuthProvider><SiteHeader /></AuthProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile" })).toBeInTheDocument();
  });
});

describe("dashboards", () => {
  it("student dashboard shows a loading state, then an error with a retry", async () => {
    // Every data request stays pending until the test fails them all.
    const rejects: Array<(e: unknown) => void> = [];
    const reject = (e: unknown) => rejects.forEach((r) => r(e));
    vi.mocked(apiGet).mockImplementation((path: string) => (path === "/auth/me" ? Promise.resolve({ user: student }) : new Promise((_, r) => rejects.push(r))));
    render(<AuthProvider><StudentDashboard /></AuthProvider>);
    expect(await screen.findByText(/Welcome, Priya/)).toBeInTheDocument();
    expect(screen.getByText("Please verify your email address")).toBeInTheDocument();
    reject({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong" });
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("admin navigation shows only the sections the admin is permitted to use", async () => {
    vi.mocked(apiGet).mockResolvedValue({ user: { ...student, role: "admin", permissions: ["email.view"], emailVerified: true } });
    render(
      <AuthProvider>
        <DashboardShell role="admin" title="Administration" nav={[{ href: "/admin", label: "Dashboard", permission: "students.read" }, { href: "/admin/email", label: "Email notifications", permission: "email.view" }, { href: "/admin/settings", label: "Account settings" }]}>
          <p>content</p>
        </DashboardShell>
      </AuthProvider>,
    );
    const nav = await screen.findByRole("navigation", { name: "Administration sections" });
    expect(within(nav).queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Email notifications" })).toBeInTheDocument();
  });

  it("a student opening the admin area is told it is not available", async () => {
    vi.mocked(apiGet).mockResolvedValue({ user: student });
    render(<AuthProvider><DashboardShell role="admin" title="Administration" nav={[{ href: "/admin", label: "Dashboard" }]}><p>secret</p></DashboardShell></AuthProvider>);
    await waitFor(() => expect(screen.getByText("This area is not available for your account")).toBeInTheDocument());
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});
