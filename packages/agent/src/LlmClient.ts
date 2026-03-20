// ============================================================
// LlmClient — Official SDK Wrapper (OpenAI / Anthropic)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export class LlmClient {
  private openai?: OpenAI;
  private anthropic?: Anthropic;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {
    const normalizedUrl = this.baseUrl.replace(/\/$/, "");
    const isAnthropic = normalizedUrl.includes("coding") || normalizedUrl.includes("anthropic");

    if (isAnthropic) {
      // 官方 Anthropic SDK
      // 注意：SDK 内部会自动将 baseURL 拼接上 /v1/messages，这也是业界标准做法。
      this.anthropic = new Anthropic({
        apiKey: this.apiKey,
        baseURL: normalizedUrl,
        maxRetries: 3, // SDK 自带指数退避重试，非常 solid
        timeout: 30000,
      });
    } else {
      // 官方 OpenAI SDK
      this.openai = new OpenAI({
        apiKey: this.apiKey,
        baseURL: normalizedUrl,
        maxRetries: 3,
        timeout: 30000,
      });
    }
  }

  async complete(sysPrompt: string, userPrompt: string): Promise<string> {
    if (this.anthropic) {
      console.log(
        `[LlmClient] Sending request via Anthropic SDK to ${this.baseUrl} (Model: ${this.model})`,
      );
      const response = await this.anthropic.messages.create({
        model: this.model,
        system: sysPrompt,
        max_tokens: 4096,
        messages: [{ role: "user", content: userPrompt }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        return content.text;
      }
      return "";
    } else if (this.openai) {
      console.log(
        `[LlmClient] Sending request via OpenAI SDK to ${this.baseUrl} (Model: ${this.model})`,
      );
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      return response.choices[0].message?.content || "";
    }
    throw new Error("No valid LLM SDK initialized");
  }
}
