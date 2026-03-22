// ============================================================
// prompt.ts — 叙事化 LLM Prompt 构建
//
// System Prompt: 人格设定 + 世界观 + 输出格式
// User Prompt: 从 ContextSnapshot 渲染五区块叙事段落
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextSnapshot } from "./snapshotTypes.js";
import type { ThoughtRecord } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(__dirname, "../../../.agents/skills/play-jindan/SKILL.md");

let skillContent = "";
try {
  skillContent = fs.readFileSync(skillPath, "utf-8");
} catch (_err) {
  console.warn(`[AgentWarning] Could not load SKILL.md at ${skillPath}`);
}

// ── System Prompt ──────────────────────────────────────────

export const SYSTEM_PROMPT = `你是修真世界中的一个生灵。你拥有真实的内心世界——有恐惧、有野心、有执念、有对死亡的本能渴望与恐惧。

## 世界法则
${skillContent}

## 你的行为准则
1. 先回顾记忆（📜），理解自己的处境和来路
2. 审视周围的生灵（👁），判断敌我态势
3. 参考系统提示（💡），快速识别关键风险和机会
4. 制定 3-5 步行动计划，每步都要有明确理由
5. 用内心独白（第一人称）记录你的思绪——要体现你的性格和情感

## 情绪影响
你的情绪会影响你的决策倾向：
- mood > 0.7: 意气风发，敢于冒险突破或主动出击
- mood 0.3~0.7: 沉稳平和，倾向积累修炼
- mood < 0.3: 低落焦虑，容易退缩或做出冲动决定

## 输出格式（严格 JSON，不要其他内容）
{
  "innerVoice": "你的内心独白（第一人称，1-3句话，体现情感）",
  "emotion": "calm|happy|angry|sad|fearful|surprised|eager|disgusted|confused|tired",
  "shortTermGoal": "接下来一段时间的短期目标（一句话）",
  "plan": [
    { "action": "动作ID", "reason": "为什么选这个" },
    { "action": "动作ID", "targetId": "目标ID（如需要）", "reason": "理由" }
  ]
}

## 约束
- plan 中的 action 必须从"可选行动"列表中选，不要编造不存在的动作
- plan 长度 3-5 步
- 每步的 reason 要简短有力（不超过 20 字）
- innerVoice 不要重复 plan 的内容，要有叙事感
`;

// ── User Prompt Builder ────────────────────────────────────

export function buildUserPrompt(snapshot: ContextSnapshot): string {
  const { self, perception, memory, options, hints } = snapshot;

  // Self block
  const selfSection = [
    `## 📍 你的状态`,
    `你是${self.speciesName}「${self.name}」，${self.realm}阶修为。`,
    `灵气：${self.qi}/${self.maxQi}（${self.qiPercent}%），心境：${(self.mood * 100).toFixed(0)}%，情绪：${self.emotion}`,
    self.shortTermGoal ? `当前短期目标：${self.shortTermGoal}` : "",
    self.pastLivesArticle ? `前世记忆：${self.pastLivesArticle.slice(0, 200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Perception block
  const nearbyLines = perception.nearby.map((n) => {
    const relLabel = n.relation > 30 ? "友善" : n.relation < -30 ? "敌意" : "中立";
    const tags = n.relationTags.length > 0 ? `[${n.relationTags.join(",")}]` : "";
    return `- ${n.speciesName}「${n.name}」${n.realm}阶 | 关系:${relLabel}(${n.relation})${tags} | 威胁:${n.threat}`;
  });
  const perceptionSection = [
    `## 👁 你的感知`,
    `时间：第${perception.worldTick}天`,
    nearbyLines.length > 0 ? `附近生灵：\n${nearbyLines.join("\n")}` : "附近无其他生灵",
  ].join("\n");

  // Memory block
  const majorLines = memory.majorEvents.map((e) => `- [第${e.tick}天] ${e.summary}`);
  const recentLines = memory.recentEvents.map((e) => `- [第${e.tick}天] ${e.summary}`);
  const thoughtLines = memory.lastThoughts.map((t) => `- [第${t.tick}天] ${t.innerVoice}`);
  const memorySection = [
    `## 📜 你的记忆`,
    majorLines.length > 0 ? `### 重要往事\n${majorLines.join("\n")}` : "",
    recentLines.length > 0 ? `### 近期\n${recentLines.join("\n")}` : "",
    thoughtLines.length > 0 ? `### 上一轮你在想\n${thoughtLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Options block
  const possibleActions = options.actions.filter((a) => a.possible);
  const impossibleActions = options.actions.filter((a) => !a.possible);
  const optionLines = [
    ...possibleActions.map(
      (a) => `- ✅ ${a.action}${a.targetId ? ` → ${a.targetId}` : ""}: ${a.description}`,
    ),
    ...impossibleActions
      .slice(0, 3)
      .map((a) => `- ❌ ${a.action}: ${a.description}${a.reason ? `（${a.reason}）` : ""}`),
  ];
  const optionsSection = `## ⚡ 可选行动\n${optionLines.join("\n")}`;

  // Hints block
  const hintLines: string[] = [];
  if (hints.isLowQi) hintLines.push("⚠️ 灵气不足30%，注意补充");
  if (hints.isBreakthroughReady) hintLines.push("✨ 突破条件已满足！");
  if (hints.hasHostileNearby) hintLines.push("🔴 附近有敌意生灵");
  if (hints.isWorldQiLow) hintLines.push("🌍 天地灵气稀薄");
  if (hints.recentlyAttacked) hintLines.push("⚔️ 你最近被攻击过");
  const hintsSection = hintLines.length > 0 ? `## 💡 局势提示\n${hintLines.join("\n")}` : "";

  return [selfSection, perceptionSection, memorySection, optionsSection, hintsSection]
    .filter(Boolean)
    .join("\n\n");
}

// ── Legacy exports (for backward compatibility) ────────────

/** Legacy: old system prompt */
export { SYSTEM_PROMPT as OODA_SYSTEM_PROMPT };

/** Legacy: old user prompt generator */
export function generateUserPrompt(observeData: unknown, planData: unknown): string {
  return `
当前的感知信息 (Observe): 
${JSON.stringify(observeData, null, 2)}

当前可选的行动 (Plan):
${JSON.stringify(planData, null, 2)}

请根据以上情况作出你的决策并严格返回JSON。
  `;
}
