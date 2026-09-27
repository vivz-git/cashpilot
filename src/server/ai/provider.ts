import "server-only";
import { GroqProvider } from "./providers/groq";
import { MockProvider } from "./providers/mock";
import type { AiProvider } from "./types";

let override: AiProvider | null = null;

/** Tests can inject a scripted provider. */
export function setAiProviderForTesting(provider: AiProvider | null): void {
  override = provider;
}

export function getAiProvider(): AiProvider {
  if (override) return override;
  const name = process.env.AI_PROVIDER ?? "mock";
  if (name === "groq") {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("AI_PROVIDER=groq but GROQ_API_KEY is not set");
    return new GroqProvider(key, process.env.GROQ_MODEL || "openai/gpt-oss-120b");
  }
  return new MockProvider();
}
