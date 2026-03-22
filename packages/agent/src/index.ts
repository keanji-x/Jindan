#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load agent-specific environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { parseArgs } from "node:util";
import type { ActionId } from "@jindan/core";
import { ApiClient } from "./ApiClient.js";
import { ChatLogger } from "./ChatLogger.js";
import { ChatHandler } from "./chatHandler.js";
import { LlmClient } from "./LlmClient.js";
import { buildUserPrompt, generateUserPrompt, SYSTEM_PROMPT } from "./prompt.js";
import type { DecisionPacket, ThoughtRecord } from "./types.js";
import { EMOTION_TAGS } from "./types.js";

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: process.env.JINDAN_HOST || "http://localhost:3001" },
    id: { type: "string", short: "i" },
    name: { type: "string", short: "n" },
    species: { type: "string", short: "s", default: "human" },
    secret: { type: "string" }, // entity secret (JINDAN_SECRET)
    "llm-key": { type: "string" }, // LLM API key
    url: { type: "string", short: "u" },
    model: { type: "string", short: "m" },
    interval: { type: "string", default: "10000" },
    heartbeat: { type: "string", default: "1000" },
  },
});

const entitySecret = values.secret || process.env.JINDAN_SECRET || process.env.ENTITY_SECRET;
const apiKey = values["llm-key"] || process.env.OPENAI_API_KEY;
const baseUrl = values.url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const modelName = values.model || process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!apiKey) {
  console.error("Error: Missing LLM API key. Pass via --llm-key or OPENAI_API_KEY env var.");
  process.exit(1);
}

const api = new ApiClient(values.host!, entitySecret);
const llm = new LlmClient(apiKey, baseUrl, modelName);

const sleepMs = parseInt(values.interval!, 10) || 10000;
const heartbeatMs = parseInt(values.heartbeat!, 10) || 1000;

// ── ThoughtBuffer — 工作记忆环形缓冲（OODA + Chat 共享） ──
const MAX_THOUGHTS = 5;
const thoughtBuffer: ThoughtRecord[] = [];

function pushThought(thought: ThoughtRecord) {
  thoughtBuffer.push(thought);
  if (thoughtBuffer.length > MAX_THOUGHTS) thoughtBuffer.shift();
}

// ChatHandler 共享 thoughtBuffer 引用
const chatHandler = new ChatHandler(api, llm, thoughtBuffer);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// ── DecisionPacket 解析 ──────────────────────────────────

function parseDecision(raw: string): DecisionPacket {
  const parsed = JSON.parse(raw);

  // 验证 emotion
  const emotion = (EMOTION_TAGS as readonly string[]).includes(parsed.emotion)
    ? parsed.emotion
    : "calm";

  // 验证 plan
  const plan = Array.isArray(parsed.plan)
    ? parsed.plan.map((step: Record<string, unknown>) => ({
        action: String(step.action ?? ""),
        targetId: step.targetId ? String(step.targetId) : undefined,
        reason: String(step.reason ?? ""),
      }))
    : [];

  return {
    innerVoice: String(parsed.innerVoice ?? parsed.thought ?? ""),
    emotion,
    shortTermGoal: String(parsed.shortTermGoal ?? ""),
    plan,
  };
}

// ============================================================
// 心跳循环 (独立 1s 周期) — 保持在线 + Chat 插队
// ============================================================

function startHeartbeatLoop(entityId: string) {
  let processing = false; // 防止心跳回调重入

  const timer = setInterval(async () => {
    if (processing) return;
    processing = true;

    try {
      const { pendingChats } = await api.heartbeat(entityId);

      // 如果有待处理的 Chat 消息，立刻插队处理
      for (const chat of pendingChats) {
        console.log(`[Heartbeat] 📩 收到用户聊天 (chatId=${chat.chatId}): "${chat.message}"`);
        try {
          const result = await chatHandler.handle(entityId, chat.message);
          await api.chatReply(
            chat.chatId,
            result.reply,
            result.suggestedActions,
            result.entityStatus,
          );
          console.log(`[Heartbeat] ✅ 回复已发送 (chatId=${chat.chatId})`);
        } catch (err) {
          console.error(
            `[Heartbeat] ❌ Chat 处理失败:`,
            err instanceof Error ? err.message : String(err),
          );
          // 仍然尝试回复一个错误消息
          await api
            .chatReply(
              chat.chatId,
              `（灵识波动异常：${err instanceof Error ? err.message : "未知错误"}）`,
            )
            .catch(() => {});
        }
      }
    } catch {
      // 心跳失败（如网络断开），静默忽略，下次重试
    }

    processing = false;
  }, heartbeatMs);

  return timer;
}

// ============================================================
// OODA 循环 (独立 10s 周期) — 自主行动
// ============================================================

async function loop(startId: string, name: string, species: string) {
  const id = startId;
  console.log(`\n\n[AgentLoop] Starting loop for Agent ID: ${id}`);
  let logger = new ChatLogger(id, path.resolve(__dirname, "../../logs"));
  let cycle = 0;

  // 启动独立的心跳循环
  const heartbeatTimer = startHeartbeatLoop(id);
  console.log(`[AgentLoop] 💓 心跳循环已启动 (${heartbeatMs}ms 间隔)`);

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
        console.log(
          `[AgentLoop] 👻 Entity ${id} is a lingering soul (游魂). Generating epitaph via LLM...`,
        );

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

          // Perform tomb with the AI-generated epitaph
          const tombResult = await api.performTomb(id, epitaph);
          if (tombResult.success) {
            console.log(`[AgentLoop] 🪦 Entity ${id} is now entombed. Epitaph recorded.`);
          } else {
            console.error(`[AgentLoop] Tomb failed:`, tombResult.error);
          }
        } catch (err) {
          console.error(
            `[AgentLoop] LLM epitaph generation failed, performing tomb without AI:`,
            err instanceof Error ? err.message : String(err),
          );
          await api.performTomb(id);
        }

        // Reincarnate: reset entity in-place (entityId stays the same)
        console.log(`[AgentLoop] 🔄 Reincarnating ${id}...`);
        try {
          const reinResult = await api.reincarnate(id, name, species);
          if (reinResult.success) {
            // entityId 不变，心跳无需重启
            logger = new ChatLogger(id, path.resolve(__dirname, "../../logs"));
            chatHandler.clearHistory(id);
            thoughtBuffer.length = 0; // 清空工作记忆
            cycle = 0;
            console.log(`[AgentLoop] 🌱 Reincarnated! Same entityId: ${id}. Continuing loop...`);
            await sleep(sleepMs);
            continue;
          } else {
            console.error(`[AgentLoop] Reincarnation failed:`, reinResult.error);
            break;
          }
        } catch (err) {
          console.error(
            `[AgentLoop] Reincarnation error:`,
            err instanceof Error ? err.message : String(err),
          );
          break;
        }
      }

      // ── 正常 OODA 循环 (存活状态) ───────────────────────
      console.log(`[AgentLoop] -> Fetching context snapshot...`);
      const snapshot = await api.getSnapshot(id, thoughtBuffer);

      const possibleActions = snapshot.options.actions.filter((a) => a.possible);
      if (possibleActions.length === 0) {
        console.log(`[AgentLoop] No actions available, sleeping...`);
        logger.push({
          cycle,
          status: lifeStatus.status,
          observe: snapshot,
          plan: [],
          llmInput: { system: "", user: "" },
          llmOutput: { thought: "No possible actions", action: "rest", raw: "" },
          actionResult: { success: false, error: "No actions" },
        });
        await sleep(sleepMs);
        continue;
      }

      console.log(`[AgentLoop] -> Pondering via LLM (${modelName})...`);
      const userPrompt = buildUserPrompt(snapshot);
      const responseText = await llm.complete(SYSTEM_PROMPT, userPrompt);
      const decision = parseDecision(responseText);

      console.log(`\n[AgentLog] 🧠 InnerVoice: ${decision.innerVoice}`);
      console.log(`[AgentLog] 😊 Emotion: ${decision.emotion}`);
      console.log(`[AgentLog] 🎯 ShortTermGoal: ${decision.shortTermGoal}`);
      console.log(
        `[AgentLog] 📋 Plan: ${decision.plan.map((s) => `${s.action}${s.targetId ? `→${s.targetId}` : ""}`).join(" → ")}`,
      );

      // 上报内心独白
      if (decision.innerVoice) {
        await api.postReport(id, decision.innerVoice).catch((err: Error) => {
          console.warn(`[AgentLoop] Failed to post report:`, err.message);
        });
      }

      // ── 串行执行 Plan ──────────────────────────────────
      const outcomes: Array<{ action: string; success: boolean }> = [];

      for (const step of decision.plan) {
        if (!step.action) continue;
        try {
          console.log(
            `[AgentLoop] -> Executing: ${step.action}${step.targetId ? ` → ${step.targetId}` : ""} (${step.reason})`,
          );
          const result = await api.performAction(id, step.action as ActionId, step.targetId);
          const success = Boolean(result.success);
          outcomes.push({ action: step.action, success });
          console.log(
            `[AgentLoop]    ${success ? "✅" : "❌"} ${step.action}: ${success ? "成功" : (result.error ?? "失败")}`,
          );
          if (!success) {
            console.log(`[AgentLoop]    Plan 中止（行动失败）`);
            break;
          }
        } catch (e) {
          outcomes.push({ action: step.action, success: false });
          console.error(
            `[AgentLoop]    ❌ ${step.action} 异常:`,
            e instanceof Error ? e.message : String(e),
          );
          break;
        }
      }

      // ── 存入工作记忆 ──────────────────────────────────
      pushThought({
        tick: snapshot.perception.worldTick,
        innerVoice: decision.innerVoice,
        plan: decision.plan,
        outcomes,
      });

      logger.push({
        cycle,
        status: lifeStatus.status,
        observe: snapshot,
        plan: decision.plan,
        llmInput: { system: SYSTEM_PROMPT, user: userPrompt },
        llmOutput: {
          thought: decision.innerVoice,
          action: decision.plan[0]?.action ?? "",
          targetId: decision.plan[0]?.targetId,
          raw: responseText,
        },
        actionResult: {
          success: outcomes.length > 0 && outcomes.every((o) => o.success),
          result: outcomes,
        },
      });
    } catch (err) {
      console.error(
        `[AgentLoop] Error in cycle:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    console.log(`[AgentLoop] Cycle complete. Sleeping for ${sleepMs}ms to prevent API burn...`);
    await sleep(sleepMs);
  }

  // 清理心跳
  clearInterval(heartbeatTimer);
}

async function main() {
  try {
    const legacyId = values.id || process.env.AGENT_ID;
    const name = values.name ?? "无名";
    const species = values.species ?? "human";

    let id: string;

    if (entitySecret) {
      // 用私钥从服务器解析 entityId
      console.log(`[AgentInit] Resolving entity from secret key...`);
      const result = await api.resolveSecret(entitySecret);
      id = result.entityId;
      console.log(`[AgentInit] Attached to entity: ${id}`);
    } else if (legacyId) {
      // 向下兼容：直接用 entityId
      console.log(`[AgentInit] Resuming character ID: ${legacyId}`);
      id = legacyId;
    } else {
      throw new Error(
        "You must provide a --secret (entity secret) or --id (entity ID).\n" +
          "Create a character at the web UI first, then use the secret key here.",
      );
    }

    await loop(id, name, species);
  } catch (err) {
    console.error(`Fatal Error:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
