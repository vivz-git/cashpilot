import { describe, expect, it } from "vitest";
import { getRuntimeModes } from "@/server/runtime-mode";

describe("getRuntimeModes", () => {
  it("reports test mode by default, matching the providers' defaults", () => {
    expect(getRuntimeModes({})).toEqual({ email: "mock", ai: "mock" });
  });

  it("reports real providers only when they are fully configured", () => {
    expect(getRuntimeModes({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example", AI_PROVIDER: "groq", GROQ_API_KEY: "k" })).toEqual({
      email: "smtp",
      ai: "groq",
    });
  });

  it("flags a selected provider with missing settings as misconfigured", () => {
    expect(getRuntimeModes({ EMAIL_PROVIDER: "smtp", AI_PROVIDER: "groq" })).toEqual({ email: "misconfigured", ai: "misconfigured" });
  });
});
