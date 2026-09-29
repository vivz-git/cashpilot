import { expect, test, type Locator, type Page } from "@playwright/test";
import { db, importCsv, signUp, uniqueEmail } from "./helpers";

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
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

  // Dashboard lists must not hide the amount or the recommended action behind an inner scroll area.
  for (const width of [page.viewportSize()!.width, 768]) {
    await page.setViewportSize({ width, height: 1024 });
    const attention = page.locator("section", { hasText: "Needs attention today (" });
    for (const text of ["$12,400.00", "Send a friendly first reminder"]) {
      const el = attention.getByText(text).filter({ visible: true }).first();
      await expect(el).toBeVisible();
      await expectWithinViewport(page, el);
    }
    await expectNoHorizontalScroll(page);
  }
  await page.setViewportSize({ width: 412, height: 915 });

  await page.getByRole("link", { name: "BL-2041" }).first().click();
  await expect(page.getByRole("heading", { name: "Invoice BL-2041" })).toBeVisible();
  await page.getByRole("button", { name: "Draft follow-up" }).click();
  await expect(page.getByRole("button", { name: "Approve & Send" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.afterAll(async () => {
  await db().end();
});
