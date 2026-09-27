import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

export const PASSWORD = "e2e-password-123";
export const fixture = (name: string) => path.join(__dirname, "fixtures", name);

let pool: Pool | null = null;
export function db(): Pool {
  pool ??= new Pool({ connectionString: E2E_DATABASE_URL });
  return pool;
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@brightline.example`;
}

export async function signUp(page: Page, org: string, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Agency name").fill(org);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function logOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function importCsv(page: Page, file: string) {
  await page.goto("/import");
  await page.getByLabel("CSV file").setInputFiles(fixture(file));
  await page.getByRole("button", { name: "Import" }).click();
}
