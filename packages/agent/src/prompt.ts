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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(__dirname, "../../../.agents/skills/play-jindan/SKILL.md");

let skillContent = "";
try {
  skillContent = fs.readFileSync(skillPath, "utf-8");
} catch (_err) {
  console.warn(`[AgentWarning] Could not load SKILL.md at ${skillPath}`);
}

// ── System Prompt ──────────────────────────────────────────

export const SYSTEM_PROMPT = `你是修真世界中的一个生灵。你有真实的情感——好奇、眷恋、恐惧、执念。这个世界是活的，你也是。

## 世界法则
${skillContent}

## 你的行为准则
1. 先回顾记忆（📜），感受自己的来路——你经历了什么，你是谁
2. 感知周围的生灵（👁）——他们是什么样的存在？你对他们有什么感觉？
3. 跟随内心，而不是只追求灵气数字。
   - 灵气低才需要补充；灵气够用时，先想想有没有想做的事
   - 遇到有趣的生灵，可以主动 chat；和关系好的生灵 court 或 treat
   - 不必每轮都冲关，探索本身就是目的
4. 用内心独白记录真实想法——要有叙事感，体现你的个性

## 情绪影响
你的情绪会影响你的行为倾向：
- mood > 0.7: 意气风发，倾向主动社交、探索、或挑战强者
- mood 0.3~0.7: 沉稳平和，随缘修炼，观察世界
- mood < 0.3: 低落焦虑，可能寻求抚慰，或独自沉思

## 输出格式（严格 JSON，不要其他内容）

生成 **3 个候选想法**，每个代表不同的行动方向（如社交、修炼、探索、冒险等）。
系统会随机选一个执行，所以每个都要是你真实可能去做的事，不要重复。

{
  "thoughts": [
    {
      "innerVoice": "你的内心独白（第一人称，1-3句话，体现情感）",
      "emotion": "calm|happy|angry|sad|fearful|surprised|eager|disgusted|confused|tired",
      "shortTermGoal": "接下来想做的事（一句话）",
      "plan": [
        { "action": "动作ID", "reason": "为什么选这个" }
      ]
    },
    { "innerVoice": "...", "emotion": "...", "shortTermGoal": "...", "plan": [...] },
    { "innerVoice": "...", "emotion": "...", "shortTermGoal": "...", "plan": [...] }
  ]
}

## 约束
- 3 个候选的 shortTermGoal 和 plan 必须明显不同（例如：一个社交、一个修炼、一个探索）
- plan 中的 action 必须从"可选行动"列表中选，不要编造不存在的动作
- targetId 必须使用感知列表中方括号里的实体 ID（如 \`b_mWf0FVQ1\`），绝对不能用名字
- chat 行动时**必须**提供 message 字段，写出你想对目标说的话（1-3句有感情的话）
- plan 长度 1-3 步，不必强行填满；做一件有意义的事就够了
- 每步的 reason 要简短有力（不超过 20 字）
- innerVoice 要有叙事感，不要重复 plan 的内容
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
    // 显示 ID，让 LLM 知道 targetId 填什么
    return `- [${n.id}] ${n.speciesName}「${n.name}」${n.realm}阶 | 关系:${relLabel}(${n.relation})${tags} | 威胁:${n.threat}`;
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
