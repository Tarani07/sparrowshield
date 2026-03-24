import Anthropic from "npm:@anthropic-ai/sdk@0.20.9";

export function getAnthropic(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey });
}

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS = 2048;
