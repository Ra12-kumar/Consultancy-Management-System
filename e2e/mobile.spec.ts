import { expect, test } from "@playwright/test";

// Phone-sized checks: the menu works, pages do not scroll sideways, and the extra college filters open as a panel.
test("the mobile menu opens and leads to the college directory", async ({ page }) => {
  // The home page is the Udaan landing page with its own header, so start from a page with the site menu.
  await page.goto("/about");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Mobile" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Colleges" }).click();
  await expect(page.getByRole("heading", { name: "Colleges across India" })).toBeVisible();
  await expect(page.getByRole("search", { name: "Search colleges" }).getByRole("searchbox", { name: "College name" })).toBeVisible();
  await page.getByRole("link", { name: "Browse with filters" }).click();
  // The filtered directory: main filters in the hero, the rest under "More filters".
  await expect(page.getByRole("search", { name: "Filter colleges" }).getByRole("combobox", { name: "Course", exact: true })).toBeVisible();
  const more = page.getByRole("form", { name: "More filters" }).getByRole("combobox", { name: "Institution" });
  await expect(more).toBeHidden();
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(more).toBeVisible();
});

for (const path of ["/", "/colleges", "/scholarships", "/courses", "/courses/browse", "/login", "/register", "/about", "/udan"]) {
  test(`no sideways scrolling on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
