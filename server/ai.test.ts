import { describe, expect, it } from "vitest";

describe("OpenRouter AI configuration", () => {
  it("accepts the configured API key on the models endpoint", async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    expect(apiKey, "OPENROUTER_API_KEY must be configured").toBeTruthy();
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.ok).toBe(true);
  }, 20_000);
});
