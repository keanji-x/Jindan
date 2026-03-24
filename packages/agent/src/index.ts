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
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.js";
import type { DecisionPacket, ThoughtRecord } from "./types.js";
import { EMOTION_TAGS } from "./types.js";

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: process.env.JINDAN_HOST || "http://localhost:3001" },
    name: { type: "string", short: "n" },
    species: { type: "string", short: "s", default: "human" },
    secret: { type: "string" }, // 单个 secret（向下兼容）
    "llm-key": { type: "string" }, // LLM API key
    url: { type: "string", short: "u" },
    model: { type: "string", short: "m" },
    heartbeat: { type: "string" }, // 每个 agent 心跳间隔（秒）
  },
});

// ── 解析 secrets 列表 ────────────────────────────────────
function parseSecrets(): string[] {
  // --secret 优先（单个，向下兼容）
  if (values.secret) return [values.secret];
  // JINDAN_SECRETS（逗号分隔）
  const envSecrets = process.env.JINDAN_SECRETS;
  if (envSecrets) {
    return envSecrets
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // 向下兼容旧 JINDAN_SECRET
  if (process.env.JINDAN_SECRET) return [process.env.JINDAN_SECRET];
  return [];
}

const secrets = parseSecrets();
const apiKey = values["llm-key"] || process.env.OPENAI_API_KEY;
const baseUrl = values.url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const modelName = values.model || process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!apiKey) {
  console.error("Error: Missing LLM API key. Pass via --llm-key or OPENAI_API_KEY env var.");
  process.exit(1);
}
if (secrets.length === 0) {
  console.error(
    "Error: No entity secrets found.\n" +
      "Set JINDAN_SECRETS in .env (comma-separated) or pass --secret.",
  );
  process.exit(1);
}

// 共享的无认证 client，仅用于初始化阶段的 resolveSecret
const initApi = new ApiClient(values.host!);
const llm = new LlmClient(apiKey, baseUrl, modelName);

const heartbeatSec = parseInt(values.heartbeat || process.env.AGENT_HEARTBEAT || "10", 10);
const heartbeatMs = heartbeatSec * 1000;

// ── AgentSlot — 每个角色的独立状态 ────────────────────────
const MAX_THOUGHTS = 5;

interface AgentSlot {
  entityId: string;
  api: ApiClient;        // 每个 slot 自带认证 header
  thoughtBuffer: ThoughtRecord[];
  chatHandler: ChatHandler;
  chatLogger: ChatLogger;
  cycle: number;
}

function pushThought(slot: AgentSlot, thought: ThoughtRecord) {
  slot.thoughtBuffer.push(thought);
  if (slot.thoughtBuffer.length > MAX_THOUGHTS) slot.thoughtBuffer.shift();
}

// ── 辅助函数 ──────────────────────────────────────────────

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

function parseSingleDecision(parsed: Record<string, unknown>): DecisionPacket {
  const emotion = (EMOTION_TAGS as readonly string[]).includes(parsed.emotion as string)
    ? (parsed.emotion as DecisionPacket["emotion"])
    : "calm";

  const plan = Array.isArray(parsed.plan)
    ? parsed.plan.map((step: Record<string, unknown>) => ({
        action: String(step.action ?? ""),
        targetId: step.targetId ? String(step.targetId) : undefined,
        message: step.message ? String(step.message) : undefined,
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

function parseDecision(raw: string): DecisionPacket {
  const parsed = JSON.parse(raw);

  // 新格式：{ thoughts: [...] } — 随机抽一个
  if (Array.isArray(parsed.thoughts) && parsed.thoughts.length > 0) {
    const idx = Math.floor(Math.random() * parsed.thoughts.length);
    const chosen = parseSingleDecision(parsed.thoughts[idx] as Record<string, unknown>);
    console.log(
      `[AgentLoop] 🎲 从 ${parsed.thoughts.length} 个候选想法中选了第 ${idx + 1} 个: "${chosen.shortTermGoal}"`,
    );
    // 把其他候选打印出来方便调试
    for (let i = 0; i < parsed.thoughts.length; i++) {
      if (i !== idx) {
        const alt = parsed.thoughts[i] as Record<string, unknown>;
        console.log(`[AgentLoop]    候选${i + 1}(未选): "${String(alt.shortTermGoal ?? "")}"`);
      }
    }
    return chosen;
  }

  // 兼容旧格式：单个 DecisionPacket
  return parseSingleDecision(parsed as Record<string, unknown>);
}

// ============================================================
// 心跳处理 — 处理 pending chats（串行，无 setInterval）
// ============================================================

async function processHeartbeat(slot: AgentSlot) {
  try {
    const { pendingChats } = await slot.api.heartbeat(slot.entityId);

    for (const chat of pendingChats) {
      console.log(
        `[${slot.entityId}] 📩 收到用户聊天 (chatId=${chat.chatId}): "${chat.message}"`,
      );
      try {
        const result = await slot.chatHandler.handle(
          slot.entityId,
          chat.message,
          chat.fromName,
          chat.fromId,
        );
        await slot.api.chatReply(
          chat.chatId,
          result.reply,
          result.suggestedActions,
          result.entityStatus,
        );
        console.log(`[${slot.entityId}] ✅ 回复已发送 (chatId=${chat.chatId})`);
        console.log(`[${slot.entityId}] 💬 回复内容: "${result.reply}"`);

        slot.chatLogger.pushChat({
          ts: new Date().toISOString(),
          chatId: chat.chatId,
          incomingMessage: chat.message,
          llmReply: result.reply,
        });
      } catch (err) {
        console.error(
          `[${slot.entityId}] ❌ Chat 处理失败:`,
          err instanceof Error ? err.message : String(err),
        );
        await slot.api
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
}

// ============================================================
// OODA 单轮 — 对一个 AgentSlot 执行一次 OODA 循环
// ============================================================

async function runOodaCycle(slot: AgentSlot, name: string, species: string): Promise<boolean> {
  const { entityId } = slot;
  slot.cycle++;

  try {
    // ── 生死检查 ──────────────────────────────────────
    const lifeStatus = await slot.api.getStatus(entityId);

    if (lifeStatus.status === "entombed") {
      console.log(`[${entityId}] 🪦 已安息 (entombed). 跳过此 slot.`);
      return false;
    }

    if (lifeStatus.status === "lingering") {
      console.log(`[${entityId}] 👻 游魂状态，生成墓志铭...`);

      const memoryData = await slot.api.getMemory(entityId);
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

        console.log(`[${entityId}] 📝 AI Epitaph:\n${epitaph}`);
        await slot.api.postReport(entityId, `[墓志铭] ${epitaph}`).catch(() => {});

        const tombResult = await slot.api.performTomb(entityId, epitaph);
        if (tombResult.success) {
          console.log(`[${entityId}] 🪦 已安葬。`);
        } else {
          console.error(`[${entityId}] Tomb failed:`, tombResult.error);
        }
      } catch (err) {
        console.error(
          `[${entityId}] LLM 墓志铭生成失败:`,
          err instanceof Error ? err.message : String(err),
        );
        await slot.api.performTomb(entityId);
      }

      // 转世
      console.log(`[${entityId}] 🔄 转世中...`);
      try {
        const reinResult = await slot.api.reincarnate(entityId, name, species);
        if (reinResult.success) {
          slot.chatLogger = new ChatLogger(entityId, path.resolve(__dirname, "../../logs"));
          slot.chatHandler.clearHistory(entityId);
          slot.thoughtBuffer.length = 0;
          slot.cycle = 0;
          console.log(`[${entityId}] 🌱 转世成功！`);
          return true;
        }
        console.error(`[${entityId}] 转世失败:`, reinResult.error);
        return false;
      } catch (err) {
        console.error(
          `[${entityId}] 转世异常:`,
          err instanceof Error ? err.message : String(err),
        );
        return false;
      }
    }

    // ── 正常 OODA 循环 (存活状态) ───────────────────────
    const snapshot = await slot.api.getSnapshot(entityId, slot.thoughtBuffer);

    const possibleActions = snapshot.options.actions.filter((a) => a.possible);
    if (possibleActions.length === 0) {
      console.log(`[${entityId}] 无可执行行动，跳过。`);
      slot.chatLogger.push({
        cycle: slot.cycle,
        status: lifeStatus.status,
        observe: snapshot,
        plan: [],
        llmInput: { system: "", user: "" },
        llmOutput: { thought: "No possible actions", action: "rest", raw: "" },
        actionResult: { success: false, error: "No actions" },
      });
      return true;
    }

    console.log(`[${entityId}] 🧠 思考中 (${modelName})...`);
    const userPrompt = buildUserPrompt(snapshot);
    const responseText = await llm.complete(SYSTEM_PROMPT, userPrompt);
    const decision = parseDecision(responseText);

    console.log(`[${entityId}] 💭 ${decision.innerVoice}`);
    console.log(`[${entityId}] 😊 ${decision.emotion} | 🎯 ${decision.shortTermGoal}`);
    console.log(
      `[${entityId}] 📋 ${decision.plan.map((s) => `${s.action}${s.targetId ? `→${s.targetId}` : ""}`).join(" → ")}`,
    );

    // 上报内心独白
    if (decision.innerVoice) {
      await slot.api.postReport(entityId, decision.innerVoice).catch((err: Error) => {
        console.warn(`[${entityId}] Failed to post report:`, err.message);
      });
    }

    // ── 串行执行 Plan ──────────────────────────────────
    const outcomes: Array<{ action: string; success: boolean }> = [];

    for (const step of decision.plan) {
      if (!step.action) continue;
      try {
        const payload = step.message ? { message: step.message } : undefined;
        console.log(
          `[${entityId}] -> ${step.action}${step.targetId ? ` → ${step.targetId}` : ""} (${step.reason})`,
        );
        if (step.action === "chat" && step.message) {
          console.log(`[${entityId}]    💬 传音: "${step.message}"`);
        }
        const result = await slot.api.performAction(
          entityId,
          step.action as ActionId,
          step.targetId,
          payload,
        );
        const success = Boolean(result.success);
        outcomes.push({ action: step.action, success });
        console.log(
          `[${entityId}]    ${success ? "✅" : "❌"} ${step.action}: ${success ? "成功" : (result.error ?? "失败")}`,
        );

        if (success && Array.isArray(result.events)) {
          for (const evt of result.events as Array<Record<string, unknown>>) {
            if (evt.type === "entity_chat") {
              const summary = String(evt.summary ?? evt.message ?? "");
              if (summary) console.log(`[${entityId}]    📨 ${summary}`);
            }
          }
        }

        if (!success) {
          console.log(`[${entityId}]    Plan 中止（行动失败）`);
          break;
        }
      } catch (e) {
        outcomes.push({ action: step.action, success: false });
        console.error(
          `[${entityId}]    ❌ ${step.action} 异常:`,
          e instanceof Error ? e.message : String(e),
        );
        break;
      }
    }

    // ── 存入工作记忆 ──────────────────────────────────
    pushThought(slot, {
      tick: snapshot.perception.worldTick,
      innerVoice: decision.innerVoice,
      plan: decision.plan,
      outcomes,
    });

    slot.chatLogger.push({
      cycle: slot.cycle,
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
      `[${entityId}] Error in cycle:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  return true;
}

// ============================================================
// Main — 初始化所有 AgentSlot，启动 round-robin 主循环
// ============================================================

async function main() {
  try {
    const name = values.name ?? "无名";
    const species = values.species ?? "human";

    // ── 解析所有 secrets → AgentSlots ──────────────────
    console.log(`[Init] 解析 ${secrets.length} 个 entity secret(s)...`);
    const slots: AgentSlot[] = [];

    for (const secret of secrets) {
      try {
        const result = await initApi.resolveSecret(secret);
        const entityId = result.entityId;
        const slotApi = new ApiClient(values.host!, secret);
        const thoughtBuffer: ThoughtRecord[] = [];
        slots.push({
          entityId,
          api: slotApi,
          thoughtBuffer,
          chatHandler: new ChatHandler(slotApi, llm, thoughtBuffer),
          chatLogger: new ChatLogger(entityId, path.resolve(__dirname, "../../logs")),
          cycle: 0,
        });
        console.log(`[Init] ✅ ${entityId} (secret: ${secret.slice(0, 8)}...)`);
      } catch (err) {
        console.error(
          `[Init] ❌ secret ${secret.slice(0, 8)}... 解析失败:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (slots.length === 0) {
      throw new Error("No valid entities resolved. Check your JINDAN_SECRETS.");
    }

    const totalCycleMs = heartbeatMs * slots.length;
    console.log(`\n[Init] 🚀 启动 ${slots.length} 个 Agent，轮询周期 ${totalCycleMs / 1000}s`);
    console.log(`[Init]    每个 Agent 间隔 ${heartbeatMs / 1000}s`);
    console.log(`[Init]    Entities: ${slots.map((s) => s.entityId).join(", ")}\n`);

    // ── Round-robin 主循环 ────────────────────────────
    while (true) {
      for (const slot of slots) {
        await processHeartbeat(slot);
        await runOodaCycle(slot, name, species);
        await sleep(heartbeatMs);
      }
    }
  } catch (err) {
    console.error(`Fatal Error:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
