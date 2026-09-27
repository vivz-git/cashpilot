import { TEST_DATABASE_URL } from "./env";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AI_PROVIDER = "mock";
process.env.EMAIL_PROVIDER = "mock";
