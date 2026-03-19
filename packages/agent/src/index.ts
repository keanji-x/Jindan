#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../env/.env") });

import { parseArgs } from "node:util";
import type { ActionId } from "@jindan/core";
import { ApiClient } from "./ApiClient.js";
import { LlmClient } from "./LlmClient.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: "http://localhost:3001" },
    id: { type: "string", short: "i" },
    name: { type: "string", short: "n" },
    species: { type: "string", short: "s", default: "human" },
    key: { type: "string", short: "k" },
    url: { type: "string", short: "u" },
    model: { type: "string", short: "m" },
    interval: { type: "string", default: "10000" }, // 10 seconds default
  },
});

const apiKey = values.key || process.env.OPENAI_API_KEY;
const baseUrl = values.url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const modelName = values.model || process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!apiKey) {
  console.error("Error: Missing LLM API key. Pass via --key or OPENAI_API_KEY env var.");
  process.exit(1);
}

const api = new ApiClient(values.host!);
const llm = new LlmClient(apiKey, baseUrl, modelName);
const sleepMs = parseInt(values.interval!, 10) || 10000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { SYSTEM_PROMPT, generateUserPrompt } from "./prompt.js";

const EPITAPH_PROMPT = `
你已死亡，灵魂飘荡在天地之间。
作为游魂，你现在唯一能做的就是为自己写一篇墓志铭——回顾这一生的经历，总结得失。

请根据以下你的生平事件，写一篇墓志铭。要求：
1. 以第一人称书写
2. 回顾重要事件（战斗、修炼、突破等）
3. 总结得失与感悟
4. 文风可以悲壮、豁达、或充满禅意，取决于你的性格

请仅返回 JSON 格式：
{
  "epitaph": "你的墓志铭全文"
}
`;

import { ChatLogger } from "./ChatLogger.js";

async function loop(id: string) {
  console.log(`\n\n[AgentLoop] Starting loop for Agent ID: ${id}`);
  const logger = new ChatLogger(id, path.resolve(__dirname, "../../logs"));
  let cycle = 0;

  while (true) {
    cycle++;
    try {
      // ── 生死检查 ──────────────────────────────────────
      console.log(`[AgentLoop] -> Checking life status...`);
      const lifeStatus = await api.getStatus(id);

      if (lifeStatus.status === "entombed") {
        console.log(`[AgentLoop] 🪦 Entity ${id} is entombed (安息). Exiting loop.`);
        console.log(`[AgentLoop] Epitaph:\n${lifeStatus.life.article}`);
        break;
      }

      if (lifeStatus.status === "lingering") {
        console.log(`[AgentLoop] 👻 Entity ${id} is a lingering soul (游魂). Generating epitaph via LLM...`);

        // Retrieve memory for the LLM to reflect on
        const memoryData = await api.getMemory(id);
        const epitaphUserPrompt = `
你的生平记忆 (Memory):
${JSON.stringify(memoryData, null, 2)}

你之前的文章/前世记忆:
${lifeStatus.life.article || "（无前世记忆，这是第一世）"}

请根据以上信息为自己写墓志铭，严格返回JSON。
`;

        try {
          const responseText = await llm.complete(EPITAPH_PROMPT, epitaphUserPrompt);
          const parsed = JSON.parse(responseText);
          const epitaph = parsed.epitaph || parsed.text || "（无言以对）";

          console.log(`[AgentLoop] 📝 AI Epitaph:\n${epitaph}`);

          // Post the epitaph as a report first
          await api.postReport(id, `[墓志铭] ${epitaph}`).catch(() => {});

          // Perform tomb
          const tombResult = await api.performTomb(id);
          if (tombResult.success) {
            console.log(`[AgentLoop] 🪦 Entity ${id} is now entombed. Epitaph recorded.`);
          } else {
            console.error(`[AgentLoop] Tomb failed:`, tombResult.error);
          }
        } catch (err) {
          console.error(`[AgentLoop] LLM epitaph generation failed, performing tomb without AI:`, err instanceof Error ? err.message : String(err));
          await api.performTomb(id);
        }

        // After tomb, the entity is entombed — exit
        console.log(`[AgentLoop] Agent ${id} has been laid to rest. Exiting.`);
        break;
      }

      // ── 正常 OODA 循环 (存活状态) ───────────────────────
      console.log(`[AgentLoop] -> Observing world...`);
      const observeData = await api.getObserve(id);
      
      console.log(`[AgentLoop] -> Planning...`);
      const planData = await api.getPlan(id);

      if (planData.length === 0) {
        console.log(`[AgentLoop] No actions available, sleeping...`);
        logger.push({
          cycle,
          status: lifeStatus.status,
          observe: observeData,
          plan: planData,
          llmInput: { system: "", user: "" },
          llmOutput: { thought: "No possible actions", action: "rest", raw: "" },
          actionResult: { success: false, error: "No actions" }
        });
        await sleep(sleepMs);
        continue;
      }

      console.log(`[AgentLoop] -> Pondering via LLM (${modelName})...`);
      const userPrompt = generateUserPrompt(observeData, planData);

      const responseText = await llm.complete(SYSTEM_PROMPT, userPrompt);
      const parsed = JSON.parse(responseText);
      
      const { thought, action, targetId } = parsed;
      console.log(`\n[AgentLog] Thought: ${thought}`);
      console.log(`[AgentLog] Action: ${action} ${targetId ? `on ${targetId}` : ""}`);

      if (thought) {
        await api.postReport(id, thought).catch((err) => {
          console.warn(`[AgentLoop] Failed to post report:`, err.message);
        });
      }

      let actionResult: { success: boolean, error?: string, result?: unknown } = { success: false, error: "Not run" };
      if (action) {
        try {
          const result = await api.performAction(id, action as ActionId, targetId);
          console.log(`[AgentLoop] Action Result:`, JSON.stringify(result));
          actionResult = {
            success: Boolean(result.success),
            error: result.error as string | undefined,
            result: result.result
          };
        } catch(e) {
          actionResult = { success: false, error: e instanceof Error ? e.message : String(e) };
          console.error(`[AgentLoop] Action failed:`, actionResult.error);
        }
      }

      logger.push({
        cycle,
        status: lifeStatus.status,
        observe: observeData,
        plan: planData,
        llmInput: { system: SYSTEM_PROMPT, user: userPrompt },
        llmOutput: { thought, action, targetId, raw: responseText },
        actionResult
      });

    } catch (err) {
      console.error(`[AgentLoop] Error in cycle:`, err instanceof Error ? err.message : String(err));
    }
    
    console.log(`[AgentLoop] Cycle complete. Sleeping for ${sleepMs}ms to prevent API burn...`);
    await sleep(sleepMs);
  }
}

async function main() {
  try {
    let id = values.id || process.env.AGENT_ID;

    if (!id) {
      const name = values.name;
      if (!name) {
        throw new Error("You must provide either an --id or a --name to create a new character.");
      }
      
      console.log(`[AgentInit] Creating new character: ${name} (${values.species})`);
      const result = await api.createEntity(name, values.species as "human" | "beast" | "plant");
      id = result.id;
      console.log(`[AgentInit] Created successfully! ID: ${id}`);
    } else {
      console.log(`[AgentInit] Resuming character ID: ${id}`);
    }

    await loop(id!);
  } catch (err) {
    console.error(`Fatal Error:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
