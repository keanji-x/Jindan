// ============================================================
// ChatHandler — 处理用户与角色潜意识的对话
//
// 整合 ContextSnapshot + ThoughtBuffer，与 OODA 循环共享上下文
// ============================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiClient } from "./ApiClient.js";
import type { LlmClient } from "./LlmClient.js";
import type { ContextSnapshot } from "./snapshotTypes.js";
import type { ThoughtRecord } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── 世界规则设定 (SKILL.md) ───────────────────────────────
let SKILL_CONTENT = "";
try {
  const skillPath = resolve(__dirname, "../../../.agents/skills/play-jindan/SKILL.md");
  SKILL_CONTENT = readFileSync(skillPath, "utf-8");
} catch {
  console.warn("[ChatHandler] Could not load SKILL.md");
}

// ── 聊天历史 ──────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Chat System Prompt ────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `你是「{name}」的潜意识——内心深处最真实的声音。
你不是外部顾问或助手，你就是这个修仙者自己内心的想法。
你以第一人称思考，你的情感、恐惧、野心都是真实的。

## 世界规则
${SKILL_CONTENT}

## 回复规则
1. 以「潜意识」的口吻回复，像内心独白一样自然
2. 根据你当前的状态和环境给出真实的判断
3. 回答简洁有力，不要啰嗦，像修仙者的内心独白
4. 严格返回 JSON 格式：
{
  "reply": "你的回复内容（自然语言）",
  "suggestedActions": [
    { "action": "动作ID", "targetId": "目标ID（可选）", "reason": "理由" }
  ]
}
5. suggestedActions 只能从"可选行动"中选择，没有建议时返回空数组
`;

export class ChatHandler {
  /** entityId → chat history (最近保留 20 轮) */
  private readonly chatHistories = new Map<string, ChatMessage[]>();

  constructor(
    private readonly api: ApiClient,
    private readonly llm: LlmClient,
    /** 共享 OODA 循环的工作记忆，让 Chat 知道 NPC 刚才在做什么 */
    private readonly thoughtBuffer: ThoughtRecord[] = [],
  ) {}

  /**
   * 处理一条用户聊天消息：
   * 1. 用 snapshot API 一站式获取上下文
   * 2. 注入 ThoughtBuffer — 让 Chat 知道 NPC 刚才在想什么
   * 3. LLM 返回结构化 JSON
   */
  async handle(
    entityId: string,
    userMessage: string,
  ): Promise<{
    reply: string;
    suggestedActions: Array<{ action: string; targetId?: string; description: string }>;
    entityStatus: Record<string, unknown>;
  }> {
    // ── 一站式拉取上下文 ──────────────────────────────
    const snapshot = await this.api.getSnapshot(entityId, this.thoughtBuffer);

    // ── 构建 System Prompt ────────────────────────────
    const systemPrompt = CHAT_SYSTEM_PROMPT.replace("{name}", snapshot.self.name);

    // ── 构建上下文段落 ───────────────────────────────
    const contextBlock = this.buildContext(snapshot);

    // ── 管理聊天历史 ────────────────────────────────
    let history = this.chatHistories.get(entityId) || [];
    history.push({ role: "user", content: userMessage });

    // 保留最近 20 轮对话防止 token 溢出
    if (history.length > 40) {
      history = history.slice(-40);
    }
    this.chatHistories.set(entityId, history);

    // ── 构建完整 prompt ─────────────────────────────
    const chatLines = history.map((m) => `${m.role === "user" ? "用户" : "潜意识"}: ${m.content}`);
    const userPrompt = `${contextBlock}\n\n## 对话\n${chatLines.join("\n\n")}`;

    try {
      const responseText = await this.llm.complete(systemPrompt, userPrompt);

      // 尝试解析 JSON
      let reply: string;
      let suggestedActions: Array<{ action: string; targetId?: string; description: string }> = [];

      try {
        const parsed = JSON.parse(responseText);
        reply = String(parsed.reply ?? responseText);
        if (Array.isArray(parsed.suggestedActions)) {
          // 验证每个建议的 action 在可选列表中
          const possibleActions = snapshot.options.actions.filter((a) => a.possible);
          suggestedActions = parsed.suggestedActions
            .filter((s: Record<string, unknown>) => {
              const actionId = String(s.action ?? "");
              return possibleActions.some(
                (a) => a.action === actionId && (!s.targetId || a.targetId === String(s.targetId)),
              );
            })
            .map((s: Record<string, unknown>) => ({
              action: String(s.action),
              targetId: s.targetId ? String(s.targetId) : undefined,
              description:
                possibleActions.find((a) => a.action === String(s.action))?.description ?? "",
            }));
        }
      } catch {
        // LLM 没返回 JSON，直接用原文
        reply = responseText;
      }

      // 保存助手回复到历史
      history.push({ role: "assistant", content: reply });
      this.chatHistories.set(entityId, history);

      // 实体当前状态（从 snapshot 直接取）
      const entityStatus = {
        id: snapshot.self.id,
        name: snapshot.self.name,
        species: snapshot.self.species,
        speciesName: snapshot.self.speciesName,
        realm: snapshot.self.realm,
        qi: snapshot.self.qi,
        maxQi: snapshot.self.maxQi,
        qiPercent: snapshot.self.qiPercent,
        mood: snapshot.self.mood,
        emotion: snapshot.self.emotion,
      };

      return { reply, suggestedActions, entityStatus };
    } catch (err) {
      console.warn("[ChatHandler] LLM call failed, using fallback reply:", err);

      // ── 兜底回复：基于上下文的模板 ──────────────────
      const fallback = this.generateFallbackReply(snapshot);
      history.push({ role: "assistant", content: fallback });
      this.chatHistories.set(entityId, history);

      const entityStatus = {
        id: snapshot.self.id,
        name: snapshot.self.name,
        species: snapshot.self.species,
        speciesName: snapshot.self.speciesName,
        realm: snapshot.self.realm,
        qi: snapshot.self.qi,
        maxQi: snapshot.self.maxQi,
        qiPercent: snapshot.self.qiPercent,
        mood: snapshot.self.mood,
        emotion: snapshot.self.emotion,
      };

      return { reply: fallback, suggestedActions: [], entityStatus };
    }
  }

  /**
   * 基于当前状态生成情境化兜底回复。
   * 不依赖 LLM，完全由模板池 + 上下文权重决策。
   */
  private generateFallbackReply(snapshot: ContextSnapshot): string {
    const { self, perception, memory } = snapshot;
    const seed = (self.id.charCodeAt(0) ?? 0) + (snapshot.perception.worldTick ?? 0);
    const pick = <T>(arr: T[]): T => arr[seed % arr.length];

    // ── 维度 1：自我介绍（有近期事件时优先） ─────────
    const recentThought = memory.lastThoughts.at(-1);
    const recentEvent = memory.recentEvents.at(-1);
    if (recentThought || recentEvent) {
      const introTemplates = [
        `我是${self.name}，${recentThought ? `刚才我在想——${recentThought.innerVoice}` : recentEvent ? `不久前${recentEvent.summary}` : ""}`,
        `${self.name}在此。${recentEvent ? `方才${recentEvent.summary}，心绪未平。` : ""}`,
        `嗯……我是${self.name}。${recentThought ? `脑中还在转：${recentThought.innerVoice.slice(0, 30)}` : ""}`,
      ];
      if (Math.abs(seed) % 3 === 0) return pick(introTemplates);
    }

    // ── 维度 2：敌意关系 → 鄙视/冷漠 ────────────────
    const nearestEntity = perception.nearby.at(0);
    const relation = nearestEntity?.relation ?? 0;
    if (self.emotion === "angry" || relation < -40) {
      const contemptTemplates = [
        "你是什么东西，也配与我说话？",
        "滚。",
        `哼，区区${self.realm}阶，有何资格开口。`,
        "本座不与尔等废话。",
        "识趣的话，离我远点。",
        "……（冷冷瞥了一眼，转身离去）",
      ];
      return pick(contemptTemplates);
    }

    // ── 维度 3：低灵气 → 无暇应答 ────────────────────
    if (self.qiPercent < 20) {
      const lowQiTemplates = [
        "灵气将尽，恕不奉陪。",
        "先让我运功补气……",
        "……（闭目凝神，显然无暇应答）",
        "等我渡过此关再说。",
      ];
      return pick(lowQiTemplates);
    }

    // ── 维度 4：高好感 → 友好闲聊 ──────────────────
    if (relation > 50 || self.emotion === "happy") {
      const friendlyTemplates = [
        "哈，你来找我啦？今日天地灵气尤为充盈，当真是好时节。",
        "今天天气真好，适合出来走走。",
        "嗯，好啊。你有什么事？",
        "来得正好，我正感无聊。",
        "你找我？说吧，我在听。",
        "今日灵气充足，心情甚好。有何贵干？",
      ];
      return pick(friendlyTemplates);
    }

    // ── 维度 5：疲惫/悲伤 → 消沉 ────────────────────
    if (self.emotion === "tired" || self.emotion === "sad") {
      const sadTemplates = [
        "……嗯。",
        "你说什么……我没在听。",
        "算了，随便吧。",
        "（沉默片刻）……无事。",
        "不想说话。",
      ];
      return pick(sadTemplates);
    }

    // ── 维度 6：恐惧/警惕 → 紧张 ───────────────────
    if (self.emotion === "fearful" || self.emotion === "surprised") {
      const fearTemplates = [
        "你……你是何人！",
        "（警觉地后退一步）谁？",
        "小心些，这附近不安全。",
        "我没工夫聊，情况不对劲。",
      ];
      return pick(fearTemplates);
    }

    // ── 维度 7：平静默认 → 随缘应答 ─────────────────
    const defaultTemplates = [
      "嗯。",
      "……好。",
      "随你。",
      "有何贵干？",
      `${self.name}在此，说吧。`,
      "嗯……（沉吟片刻）",
      "今日天地平静，你找我何事？",
      "我正在修炼，有话快说。",
    ];
    return pick(defaultTemplates);
  }

  /** 从 ContextSnapshot 构建精炼的上下文段落 */
  private buildContext(snapshot: ContextSnapshot): string {
    const { self, perception, memory, options, hints } = snapshot;

    // Self
    const selfLines = [
      `## 你的状态`,
      `${self.speciesName}「${self.name}」，${self.realm}阶`,
      `灵气：${self.qi}/${self.maxQi}（${self.qiPercent}%），心境：${(self.mood * 100).toFixed(0)}%，情绪：${self.emotion}`,
      self.shortTermGoal ? `短期目标：${self.shortTermGoal}` : "",
    ].filter(Boolean);

    // Nearby
    const nearbyLines = perception.nearby.slice(0, 10).map((n) => {
      const rel = n.relation > 30 ? "友善" : n.relation < -30 ? "敌意" : "中立";
      return `- ${n.speciesName}「${n.name}」${n.realm}阶 | ${rel}(${n.relation}) | ${n.threat}`;
    });

    // Recent thoughts (from ThoughtBuffer)
    const thoughtLines = memory.lastThoughts
      .slice(-3)
      .map((t) => `- [第${t.tick}天] ${t.innerVoice}`);

    // Recent memory
    const memLines = [...memory.majorEvents, ...memory.recentEvents]
      .slice(0, 8)
      .map((e) => `- [第${e.tick}天] ${e.summary}`);

    // Available actions
    const actionLines = options.actions
      .filter((a) => a.possible)
      .map((a) => `- ${a.action}${a.targetId ? ` → ${a.targetId}` : ""}: ${a.description}`);

    // Hints
    const hintLines: string[] = [];
    if (hints.isLowQi) hintLines.push("⚠️ 灵气不足30%");
    if (hints.isBreakthroughReady) hintLines.push("✨ 可以突破！");
    if (hints.hasHostileNearby) hintLines.push("🔴 附近有敌意生灵");
    if (hints.recentlyAttacked) hintLines.push("⚔️ 最近被攻击过");

    const sections = [
      selfLines.join("\n"),
      nearbyLines.length > 0 ? `## 周围\n${nearbyLines.join("\n")}` : "",
      thoughtLines.length > 0 ? `## 你刚才在想\n${thoughtLines.join("\n")}` : "",
      memLines.length > 0 ? `## 近期记忆\n${memLines.join("\n")}` : "",
      `## 可选行动\n${actionLines.join("\n") || "无"}`,
      hintLines.length > 0 ? `## 局势\n${hintLines.join("\n")}` : "",
    ];

    return sections.filter(Boolean).join("\n\n");
  }

  /** 清除某个实体的聊天历史 */
  clearHistory(entityId: string): void {
    this.chatHistories.delete(entityId);
  }
}
