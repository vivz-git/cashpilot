import type { AnalysisContext } from "../context";
import { templateDraft, type DraftContext } from "../drafting";
import { ruleBasedAnalysis } from "../rules";
import type { AiProvider, AiRequest } from "../types";

/**
 * Deterministic offline provider: applies the same transparent rules used as
 * the fallback. Used in development without an API key and in tests.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly model = null;

  async complete(request: AiRequest): Promise<string> {
    if (request.task === "analysis") {
      return JSON.stringify(ruleBasedAnalysis(request.context as AnalysisContext));
    }
    return JSON.stringify(templateDraft(request.context as DraftContext));
  }
}
