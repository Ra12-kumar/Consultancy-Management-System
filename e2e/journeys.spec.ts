import { expect, test, type Page } from "@playwright/test";
import { ADMIN, STUDENT_PASSWORD, emailedCode } from "./db";

// The spec's core journeys, in order: a visitor browses and compares, a student registers and enquires, an admin
// works the enquiry, and the student sees the permitted update.
test.describe.configure({ mode: "serial" });

const student = { name: "Esha Student", email: `e2e-student-${Date.now()}@example.com`, mobile: "9876543211" };
let reference = "";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signing in ends with a full page load to the dashboard; wait for it before going elsewhere.
  await page.waitForURL(/\/(student|admin)$/);
}

test("a visitor searches colleges, sees labelled sample data and a separate service charge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Colleges" }).first().click();
  await expect(page.getByRole("heading", { name: "Colleges across India" })).toBeVisible();
  // The simple name search is first; the filtered directory is one click away.
  await page.getByRole("link", { name: "Browse with filters" }).click();
  await expect(page.getByText("This directory currently includes sample data")).toBeVisible();
  await page.getByRole("search", { name: "Filter colleges" }).getByRole("combobox", { name: "Course", exact: true }).selectOption({ label: "B.Tech / B.E." });
  await expect(page).toHaveURL(/course=btech-be/);
  await page.getByRole("link", { name: "View details" }).first().click();
  await expect(page.getByText("Sample data – not a real institution").first()).toBeVisible();
  await expect(page.getByText(/Consultancy service charge \(separate from college fees\)/).first()).toBeVisible();
});

test("a student registers, verifies with the emailed code, submits an enquiry and gets a reference number", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/Full name/).fill(student.name);
  await page.getByLabel(/^Email/).fill(student.email);
  await page.getByLabel(/Mobile number/).fill(student.mobile);
  await page.getByLabel(/^Password/).fill(STUDENT_PASSWORD);
  await page.getByLabel(/Confirm password/).fill(STUDENT_PASSWORD);
  await page.getByRole("button", { name: "Create student account" }).click();
  // Next: the 6-digit code from the email. Unverified students cannot sign in.
  await page.waitForURL(/\/verify-email\?sent=1/);
  // E2E runs without SMTP, so the page must say honestly that no code could be emailed (never a false "sent").
  await expect(page.getByText(/email delivery is not set up/)).toBeVisible();
  await expect(page.getByText(/emailed you a 6-digit code/)).toHaveCount(0);
  const blocked = await page.request.post("/api/auth/login", { data: { email: student.email, password: STUDENT_PASSWORD }, headers: { Origin: new URL(page.url()).origin } });
  expect(blocked.status()).toBe(403);
  await page.getByLabel(/Verification code/).fill("000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByText(/incorrect or has expired/)).toBeVisible();
  await page.getByLabel(/Verification code/).fill(await emailedCode(student.email));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  // A correct code verifies the email and signs the student in.
  await page.waitForURL(/\/student$/);
  // The /enquire page was removed; the enquiry is submitted through the same API the form used (signed-in student).
  const origin = new URL(page.url()).origin;
  const courses = (await (await page.request.get("/api/courses")).json()).data as Array<{ id: string; name: string }>;
  const btech = courses.find((c) => c.name === "B.Tech / B.E.")!;
  const created = await page.request.post("/api/enquiries", { data: { idempotencyKey: `e2e-${Date.now()}`, courses: [btech.id], colleges: [], locations: [], hostel: false, admissionYear: new Date().getFullYear(), counsellingRequest: "" }, headers: { Origin: origin } });
  expect(created.status(), await created.text()).toBe(201);
  reference = (await created.json()).data.reference as string;
  expect(reference).toMatch(/^ENQ-\d{4}-\d{6}$/);
  await page.goto(`/student/enquiries/${reference}`);
  await expect(page.getByRole("heading", { name: `Enquiry ${reference}` })).toBeVisible();
});

test("an admin sees the enquiry, moves it forward with a message, and the student sees it", async ({ page, browser }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/enquiries");
  await page.getByRole("link", { name: reference }).click();
  await page.getByLabel("Move to").selectOption("CONTACTED");
  await page.getByLabel(/Message to the student/).fill("We called you today – talk soon!");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();

  const studentPage = await (await browser.newContext()).newPage();
  await signIn(studentPage, student.email, STUDENT_PASSWORD);
  await studentPage.goto(`/student/enquiries/${reference}`);
  await expect(studentPage.getByText("We called you today – talk soon!").first()).toBeVisible();
  await expect(studentPage.getByText("In touch with you").first()).toBeVisible();
  // Students cannot open the admin area.
  await studentPage.goto("/admin/enquiries");
  await expect(studentPage.getByText("This area is not available for your account")).toBeVisible();
});
