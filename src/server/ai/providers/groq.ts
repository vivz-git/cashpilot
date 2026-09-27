import type { AiProvider, AiRequest } from "../types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 25_000;

/** Groq's OpenAI-compatible chat completions API, JSON mode. Server-side only. */
export class GroqProvider implements AiProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(request: AiRequest): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 3000,
          // Reasoning models spend output tokens thinking; keep it short for structured tasks.
          ...(this.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
      if (!res.ok) {
        // Do not include the response body: it may echo request content.
        throw new Error(`Groq API error: HTTP ${res.status}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Groq API returned no content");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}
