import { z } from "zod";
import { CONFIDENCE_LEVELS, CUSTOMER_SITUATIONS, TONES } from "@/db/schema";

export type AiTask = "analysis" | "draft";

export interface AiRequest {
  task: AiTask;
  system: string;
  user: string;
  /** The structured context the prompt was built from (used by the deterministic mock). */
  context: unknown;
}

/** A server-side LLM provider. Returns the model's raw text (expected to be JSON). */
export interface AiProvider {
  readonly name: string;
  readonly model: string | null;
  complete(request: AiRequest): Promise<string>;
}

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const analysisOutputSchema = z.object({
  priority_score: z.coerce.number().int().min(1).max(10),
  reason: shortText(600),
  customer_situation: z.enum(CUSTOMER_SITUATIONS),
  recommended_action: shortText(400),
  recommended_tone: z.enum(TONES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  missing_information: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  evidence: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const draftOutputSchema = z.object({
  subject: shortText(200),
  body: shortText(4000),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;
