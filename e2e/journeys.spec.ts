import { expect, test, type Page } from "@playwright/test";
import { ADMIN, STUDENT_PASSWORD, markVerified } from "./db";

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
  await expect(page.getByRole("heading", { name: "Explore colleges" })).toBeVisible();
  await expect(page.getByText("This directory currently includes sample data")).toBeVisible();
  await page.getByRole("search", { name: "Filter colleges" }).getByRole("combobox", { name: "Course", exact: true }).selectOption({ label: "B.Tech / B.E." });
  await expect(page).toHaveURL(/course=btech-be/);
  await page.getByRole("link", { name: "View details" }).first().click();
  await expect(page.getByText("Sample data – not a real institution").first()).toBeVisible();
  await expect(page.getByText(/Consultancy service charge \(separate from college fees\)/).first()).toBeVisible();
});

test("a student registers, verifies, completes the enquiry form and gets a reference number", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/Full name/).fill(student.name);
  await page.getByLabel(/^Email/).fill(student.email);
  await page.getByLabel(/Mobile number/).fill(student.mobile);
  await page.getByLabel(/^Password/).fill(STUDENT_PASSWORD);
  await page.getByLabel(/Confirm password/).fill(STUDENT_PASSWORD);
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(page.getByRole("status").getByText("Check your email", { exact: true })).toBeVisible();
  // Emails are only logged in tests, so the verification click is done in the database.
  await markVerified(student.email);

  await signIn(page, student.email, STUDENT_PASSWORD);
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/enquire");
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "B.Tech / B.E." }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // The last Continue must show the review step, not submit straight away.
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
  await expect(page.getByText("Your reference:")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit enquiry" }).click();
  const ref = page.getByText(/ENQ-\d{4}-\d{6}/).first();
  await expect(ref).toBeVisible();
  reference = (await ref.textContent())!.match(/ENQ-\d{4}-\d{6}/)![0];
  await page.getByRole("link", { name: "Track this enquiry" }).click();
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
