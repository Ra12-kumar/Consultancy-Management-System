import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteHeader from "@/components/SiteHeader";
import DashboardShell from "@/components/DashboardShell";
import { AuthProvider } from "@/features/auth/AuthProvider";
import OtpForm from "@/features/auth/OtpForm";
import RegisterForm, { validateRegistration } from "@/features/auth/RegisterForm";
import StudentDashboard from "@/features/student/StudentDashboard";
import { apiGet, apiPost } from "@/services/api";
import type { User } from "@/types/api";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn(), apiPost: vi.fn() }));
const nav = vi.hoisted(() => ({ go: vi.fn(), params: new URLSearchParams() }));
vi.mock("@/lib/navigation", () => ({ hardNavigate: nav.go }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const student: User = { id: "u1", name: "Priya Sharma", email: "priya@example.com", mobile: "+919876543210", role: "student", permissions: [], emailVerified: false, status: "active", createdAt: null, lastLoginAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  // Signed out, with email delivery available, unless a test says otherwise.
  vi.mocked(apiGet).mockReset().mockImplementation(((path: string) => (path === "/auth/email-delivery" ? Promise.resolve({ available: true }) : Promise.reject({ status: 401 }))) as never);
});

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

  it("sends only the allowed fields (never a role) and goes on to enter the emailed code", async () => {
    vi.mocked(apiPost).mockResolvedValue({ message: "We have sent a 6-digit code to your email." });
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/Full name/), "Priya Sharma");
    await userEvent.type(screen.getByLabelText(/^Email/), "priya@example.com");
    await userEvent.type(screen.getByLabelText(/Mobile number/), "98765 43210");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "Str0ng-pass-2026");
    await userEvent.selectOptions(screen.getByLabelText(/Highest qualification/), "class_12");
    await userEvent.type(screen.getByLabelText(/Preferred course/), "B.Tech");
    await userEvent.click(screen.getByRole("button", { name: "Create student account" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/register", { name: "Priya Sharma", email: "priya@example.com", mobile: "98765 43210", password: "Str0ng-pass-2026", qualification: "class_12", preferredCourse: "B.Tech" });
    await waitFor(() => expect(nav.go).toHaveBeenCalledWith("/verify-email?sent=1&email=priya%40example.com"));
  });

  it("is a student by default; counsellor and admin ask for an invitation code and send it with the role", async () => {
    vi.mocked(apiPost).mockResolvedValue({ message: "ok" });
    render(<RegisterForm />);
    expect(screen.getByRole("radio", { name: /Student/ })).toBeChecked();
    expect(screen.queryByLabelText(/Invitation code/)).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Counsellor/ }));
    expect(screen.queryByLabelText(/Highest qualification/)).toBeNull();
    await userEvent.type(screen.getByLabelText(/Full name/), "Meera Nair");
    await userEvent.type(screen.getByLabelText(/^Email/), "meera@example.com");
    await userEvent.type(screen.getByLabelText(/Mobile number/), "9876512345");
    await userEvent.type(screen.getByLabelText(/^Password/), "Str0ng-pass-2026");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "Str0ng-pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Create counsellor account" }));
    expect(screen.getByText("Enter the invitation code you received")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Invitation code/), "ABCD-EFGH-JKMN-PQRS");
    await userEvent.click(screen.getByRole("button", { name: "Create counsellor account" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/register", { name: "Meera Nair", email: "meera@example.com", mobile: "9876512345", password: "Str0ng-pass-2026", accountType: "counsellor", inviteCode: "ABCD-EFGH-JKMN-PQRS" });
  });

  it("sends each role to its own dashboard", async () => {
    const { homeFor } = await import("@/features/auth/AuthProvider");
    expect(homeFor({ ...student, role: "counsellor" })).toBe("/counsellor");
    expect(homeFor({ ...student, role: "admin" })).toBe("/admin");
    expect(homeFor(student)).toBe("/student");
  });
});

describe("email code form", () => {
  it("checks the code, signs the student in and goes to their dashboard", async () => {
    nav.params = new URLSearchParams("sent=1&email=priya@example.com");
    vi.mocked(apiPost).mockResolvedValue({ user: { ...student, emailVerified: true }, signedIn: true });
    render(<AuthProvider><OtpForm /></AuthProvider>);
    expect(screen.getByText(/emailed you a 6-digit code/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Verification code/), "12a34");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(screen.getByText("Enter the 6-digit code from the email")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Verification code/), "56");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(apiPost).toHaveBeenCalledWith("/auth/verify-otp", { email: "priya@example.com", code: "123456" });
    await waitFor(() => expect(nav.go).toHaveBeenCalledWith("/student"));
  });

  it("shows a wrong-code error and lets the student ask for a new code", async () => {
    nav.params = new URLSearchParams("email=priya@example.com");
    vi.mocked(apiPost).mockRejectedValueOnce({ status: 400, code: "INVALID_CODE", message: "This code is incorrect or has expired." }).mockResolvedValueOnce({ message: "We have sent a new code." });
    render(<AuthProvider><OtpForm /></AuthProvider>);
    await userEvent.type(screen.getByLabelText(/Verification code/), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByText("This code is incorrect or has expired.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resend code" }));
    expect(apiPost).toHaveBeenLastCalledWith("/auth/resend-verification", { email: "priya@example.com" });
    expect(await screen.findByText("We have sent a new code.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
  });

  it("never claims a code was sent when the server cannot send email", async () => {
    nav.params = new URLSearchParams("sent=1&email=priya@example.com");
    vi.mocked(apiGet).mockImplementation(((path: string) => (path === "/auth/email-delivery" ? Promise.resolve({ available: false }) : Promise.reject({ status: 401 }))) as never);
    render(<AuthProvider><OtpForm /></AuthProvider>);
    expect(await screen.findByText(/email delivery is not set up/)).toBeInTheDocument();
    expect(screen.queryByText(/emailed you a 6-digit code/)).toBeNull();
    expect(apiGet).toHaveBeenCalledWith("/auth/email-delivery", expect.anything());
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
