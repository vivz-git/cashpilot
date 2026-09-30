import { expect, test, type Page } from "@playwright/test";
import { db, importCsv, signUp, uniqueEmail } from "./helpers";

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test("core screens fit a phone screen", async ({ page }) => {
  await page.goto("/login");
  await expectNoHorizontalScroll(page);

  await signUp(page, "Mobile Agency", "Mo Bile", uniqueEmail("mobile"));
  await expectNoHorizontalScroll(page);

  await importCsv(page, "invoices.csv");
  await expect(page.getByText("Imported 6 invoices.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Analyze 6 new invoices/ }).click();
  await expect(page.getByText("Analyzed 6 invoices.")).toBeVisible();
  await page.reload();
  await expectNoHorizontalScroll(page);
  await expect(page.getByTestId("metric-outstanding")).toBeVisible();

  await page.getByRole("link", { name: "BL-2041" }).first().click();
  await expect(page.getByRole("heading", { name: "Invoice BL-2041" })).toBeVisible();
  await page.getByRole("button", { name: "Draft follow-up" }).click();
  await expect(page.getByRole("button", { name: "Approve & Send" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.afterAll(async () => {
  await db().end();
});
