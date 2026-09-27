import "dotenv/config";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://cashpilot:cashpilot_dev@localhost:5432/cashpilot_test";

