import type { ExtractionResult } from "../types";
import { extractWithLlm, llmConfig } from "./llm";
import { extractWithRules } from "./rules";

/** Uses the language model when one is configured, and the rule-based parser otherwise or on failure. */
export async function extractTask(text: string, now: Date = new Date()): Promise<ExtractionResult> {
  const rules = extractWithRules(text, now);
  const config = llmConfig();
  if (!config) return rules;
  try {
    return await extractWithLlm(text, now, config, rules);
  } catch (error) {
    console.error("[campuscatch] LLM extraction failed, using rules:", error);
    return { ...rules, notice: "AI extraction was unavailable, so the built-in parser was used." };
  }
}
