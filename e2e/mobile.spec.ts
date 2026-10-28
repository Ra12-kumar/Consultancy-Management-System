import { expect, test } from "@playwright/test";

// Phone-sized checks: the menu works, pages do not scroll sideways, and the college filters open as a panel.
test("the mobile menu opens and leads to the college directory", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Mobile" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Colleges" }).click();
  await expect(page.getByRole("heading", { name: "Explore colleges" })).toBeVisible();
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByRole("search", { name: "Filter colleges" }).getByRole("combobox", { name: "Course", exact: true })).toBeVisible();
});

for (const path of ["/", "/colleges", "/scholarships", "/courses", "/login", "/register", "/about"]) {
  test(`no sideways scrolling on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
