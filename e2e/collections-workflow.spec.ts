import { expect, test } from "@playwright/test";
import { db, importCsv, logIn, logOut, PASSWORD, signUp, uniqueEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

const ownerEmail = uniqueEmail("olivia");
const viewerEmail = uniqueEmail("viewer");

test("redirects anonymous visitors to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/invoices/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/login$/);
});

test("full journey: signup → import → analyze → draft → edit → approve & send → timeline", async ({ page }) => {
  // Signup and empty state
  await signUp(page, "Brightline Creative", "Olivia Owner", ownerEmail);
  await expect(page.getByText("No invoices yet")).toBeVisible();

  // Invalid CSV: clear, row-level errors and nothing imported
  await importCsv(page, "invalid.csv");
  const errors = page.getByTestId("import-errors");
  await expect(errors).toContainText("The file was not imported");
  await expect(errors).toContainText("Customer email is required.");
  await expect(errors).toContainText('"04/07/2026" is not a valid date');
  await expect(errors).toContainText('"twelve" is not a valid amount');
  await expect(errors).toContainText('Duplicate invoice number "BL-9003"');

  // Valid CSV with multiple currencies
  await importCsv(page, "invoices.csv");
  await expect(page.getByText("Imported 6 invoices.")).toBeVisible();
  // Re-importing the same file skips duplicates
  await importCsv(page, "invoices.csv");
  await expect(page.getByText("Imported 0 invoices.")).toBeVisible();
  await expect(page.getByText(/Skipped 6 already in CashPilot/)).toBeVisible();

  // Dashboard metrics
  await page.goto("/dashboard");
  const outstanding = page.getByTestId("metric-outstanding");
  await expect(outstanding).toContainText("$16,230.00");
  await expect(outstanding).toContainText("€3,200.00");
  await expect(outstanding).toContainText("£5,750.00");
  await expect(page.getByText("6 not analyzed")).toBeVisible();

  // AI analysis
  await page.getByRole("button", { name: "Analyze 6 new invoices" }).click();
  await expect(page.getByText("Analyzed 6 invoices.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("not analyzed")).toHaveCount(0);

  // Priority display: the largest, oldest invoice is at the top of the queue
  const queue = page.locator("section", { hasText: "All outstanding invoices by priority" });
  const firstRow = queue.locator("tbody tr").first();
  await expect(firstRow).toContainText("BL-2041");
  await expect(firstRow).toContainText("/10");
  await expect(firstRow).toContainText("Send a friendly first reminder");

  // Invoice detail and analysis
  await firstRow.getByRole("link", { name: "BL-2041" }).click();
  await expect(page.getByRole("heading", { name: "Invoice BL-2041" })).toBeVisible();
  const analysis = page.getByTestId("analysis");
  await expect(analysis).toContainText("Unknown");
  await expect(analysis).toContainText("low confidence");
  await expect(analysis).toContainText("Missing information");

  // Follow-up drafting
  await page.getByRole("button", { name: "Draft follow-up" }).click();
  const editor = page.getByTestId("draft-editor");
  await expect(editor).toBeVisible();
  const subject = editor.getByLabel("Subject");
  const body = editor.getByLabel(/^Message/);
  await expect(subject).toHaveValue(/BL-2041/);
  await expect(body).toHaveValue(/\$12,400\.00/);
  await expect(editor).toContainText("To ap@northwind.example");

  // Editing: unsafe wording is flagged live, then removed
  const original = await body.inputValue();
  await body.fill(`${original}\n\nWe will take legal action if this is not paid.`);
  await expect(editor).toContainText("Draft mentions legal action.");
  const edited = `${original}\n\nP.S. Happy to resend the invoice PDF if that helps.`;
  await body.fill(edited);
  await expect(editor).not.toContainText("Review before sending");
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor.getByText("Draft saved.")).toBeVisible();

  // Nothing has been sent yet
  const before = await db().query("select count(*)::int as n from email_messages m join invoices i on i.id = m.invoice_id where i.invoice_number = 'BL-2041'");
  expect(before.rows[0].n).toBe(0);

  // Approval + send
  await editor.getByRole("button", { name: "Approve & Send" }).click();
  const sent = page.getByTestId("sent-email");
  await expect(sent).toHaveCount(1);
  await expect(sent).toContainText("sent");
  await expect(sent).toContainText("To ap@northwind.example");
  // The E2E server uses the mock email provider: the UI must not present the email as delivered.
  await expect(sent).toContainText("test mode · not delivered");
  await expect(page.getByTestId("mode-banner")).toContainText("emails are recorded in CashPilot but not delivered");
  await expect(page.getByTestId("draft-editor")).toHaveCount(0);

  // Activity timeline
  const timeline = page.getByTestId("timeline");
  for (const label of ["Invoice imported", "AI analyzed", "Reminder drafted", "Reminder edited", "Reminder sent"]) {
    await expect(timeline.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Follow-ups sent")).toBeVisible();

  // Persisted email record matches exactly what was approved
  const { rows } = await db().query(
    `select m.status, m.recipient, m.subject, m.body, m.sent_at, u.email as sender
       from email_messages m join invoices i on i.id = m.invoice_id join users u on u.id = m.user_id
      where i.invoice_number = 'BL-2041'`,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "sent", recipient: "ap@northwind.example", sender: ownerEmail });
  expect(rows[0].body).toBe(edited.trim());
  expect(rows[0].sent_at).toBeTruthy();

  // Manual reply tracking: payment promised
  const outcome = page.getByTestId("outcome-form");
  await outcome.getByLabel("Outcome").selectOption("promised_payment");
  await outcome.getByLabel("Promised payment date").fill("2026-12-15");
  await outcome.getByLabel("Optional details").fill("Sam confirmed it is in the next payment run.");
  await outcome.getByRole("button", { name: "Record" }).click();
  await expect(timeline.getByText("Payment promised", { exact: true })).toBeVisible();
  await expect(timeline).toContainText("Sam confirmed it is in the next payment run.");

  // Re-analysis uses the recorded promise
  await page.getByRole("button", { name: "Re-analyze" }).click();
  await expect(page.getByTestId("analysis")).toContainText("Promised payment");

  // Dispute on another invoice
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "BL-2044" }).first().click();
  await outcome.getByLabel("Outcome").selectOption("dispute");
  await outcome.getByLabel("What is disputed?").fill("Client says the PO number was missing.");
  await outcome.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Disputed", { exact: true })).toBeVisible();

  // Dashboard answers: promised and disputed lists
  await page.goto("/dashboard");
  await expect(page.locator("section", { hasText: "Promised to pay (1)" })).toContainText("BL-2041");
  await expect(page.locator("section", { hasText: "Disputed (1)" })).toContainText("BL-2044");
  // The priority table shows the recorded dispute, not the earlier "send a friendly reminder" advice.
  const disputedRow = queue.locator("tbody tr", { hasText: "BL-2044" });
  await expect(disputedRow).toContainText("Disputed");
  await expect(disputedRow).toContainText("Resolve the dispute before sending a payment reminder.");
  await expect(disputedRow).not.toContainText("Send a friendly first reminder");
  // BL-2041 was re-analyzed after its promise, so its recommendation is current again.
  await expect(queue.locator("tbody tr", { hasText: "BL-2041" }).getByTestId("analysis-outdated")).toHaveCount(0);

  // Add a read-only teammate for the permission test below
  await page.goto("/team");
  await page.getByLabel("Name").fill("Val Viewer");
  await page.getByLabel("Email").fill(viewerEmail);
  await page.getByLabel("Initial password").fill(PASSWORD);
  await page.getByLabel("Role").selectOption("viewer");
  await page.getByRole("button", { name: "Add teammate" }).click();
  await expect(page.getByText("Teammate added.")).toBeVisible();

  await logOut(page);
});

test("login rejects a wrong password and accepts the right one", async ({ page }) => {
  await logIn(page, ownerEmail, "not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await logIn(page, ownerEmail);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an export with different column names imports after the user confirms the columns", async ({ page }) => {
  await logIn(page, ownerEmail);
  await expect(page).toHaveURL(/\/dashboard$/);

  // Hand-written file in an accounting-export layout (not a real vendor export).
  await importCsv(page, "accounting-style-export.csv");
  const matcher = page.getByTestId("column-matcher");
  await expect(matcher).toContainText("Match your columns");
  await expect(matcher.getByLabel("Customer email")).toHaveValue("EmailAddress");
  await expect(matcher.getByLabel("Amount owed")).toHaveValue("InvoiceAmountDue");
  await expect(matcher.getByLabel("Date format")).toHaveValue("ymd");
  // Nothing is imported before the user confirms.
  const count = async () =>
    (await db().query("select count(*)::int as n from invoices where invoice_number in ('XR-0212', 'XR-0219')")).rows[0].n;
  expect(await count()).toBe(0);

  await matcher.getByRole("button", { name: "Import with these columns" }).click();
  await expect(page.getByText("Imported 2 invoices.")).toBeVisible();
  expect(await count()).toBe(2);
  const { rows } = await db().query("select amount_minor::int as amount_minor, due_date::text as due_date from invoices where invoice_number = 'XR-0219'");
  expect(rows[0]).toMatchObject({ amount_minor: 115000, due_date: "2026-09-01" });
});

test("a viewer can read but cannot import, draft, send or record outcomes", async ({ page }) => {
  await logIn(page, viewerEmail);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("current-user")).toContainText("read-only");
  await expect(page.getByRole("button", { name: /Analyze|Refresh analysis/ })).toHaveCount(0);

  await page.getByRole("link", { name: "BL-2042" }).first().click();
  await expect(page.getByRole("heading", { name: "Invoice BL-2042" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft follow-up" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve & Send/ })).toHaveCount(0);
  await expect(page.getByTestId("outcome-form")).toHaveCount(0);

  await page.goto("/import");
  await expect(page.getByText("Your role is read-only.")).toBeVisible();
  await expect(page.getByLabel("CSV file")).toHaveCount(0);
});

test("another organization cannot open this organization's invoices", async ({ page }) => {
  const { rows } = await db().query("select id from invoices where invoice_number = 'BL-2041' limit 1");
  const invoiceId = rows[0].id as string;

  await signUp(page, "Rival Agency", "Rita Rival", uniqueEmail("rival"));
  await expect(page.getByText("No invoices yet")).toBeVisible();
  // With a streaming loading boundary Next.js commits a 200 status before notFound() runs,
  // so assert on what is rendered: the not-found page and none of the other org's data.
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByText("This page does not exist or you do not have access to it.")).toBeVisible();
  await expect(page.getByText("BL-2041")).toHaveCount(0);
  await expect(page.getByText("Northwind")).toHaveCount(0);
});

test.afterAll(async () => {
  await db().end();
});
