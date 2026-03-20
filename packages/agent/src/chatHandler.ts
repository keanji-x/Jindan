// ============================================================
// ChatHandler — 处理用户与角色潜意识的对话
//
// 从 Core BotService 迁移而来的 Prompt 构建和 LLM 调用逻辑
// ============================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiClient } from "./ApiClient.js";
import type { LlmClient } from "./LlmClient.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── 世界规则设定 (SKILL.md) ───────────────────────────────
let SKILL_CONTENT = "";
try {
  const skillPath = resolve(__dirname, "../../../.agents/skills/play-jindan/SKILL.md");
  SKILL_CONTENT = readFileSync(skillPath, "utf-8");
} catch {
  console.warn("[ChatHandler] Could not load SKILL.md");
}

// ── 境界名称映射 ──────────────────────────────────────────
const REALM_NAMES = [
  "凡人",
  "炼气",
  "筑基",
  "金丹",
  "元婴",
  "化神",
  "炼虚",
  "合体",
  "大乘",
  "渡劫",
  "真仙",
];

function getRealmName(realm: number): string {
  return REALM_NAMES[realm] || `${realm}阶`;
}

// ── 聊天历史 ──────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Entity {
  id: string;
  name: string;
  species: string;
  status: string;
  components?: {
    cultivation?: { realm?: number };
    combat?: { power?: number };
    tank?: {
      coreParticle: string;
      tanks: Record<string, number>;
      maxTanks: Record<string, number>;
    };
  };
}

interface AvailableAction {
  action: string;
  possible: boolean;
  description: string;
  targetId?: string;
}

interface LedgerEvent {
  tick: number;
  type: string;
  data?: unknown;
}

export class ChatHandler {
  /** entityId → chat history (最近保留 20 轮) */
  private readonly chatHistories = new Map<string, ChatMessage[]>();

  constructor(
    private readonly api: ApiClient,
    private readonly llm: LlmClient,
  ) {}

  /**
   * 处理一条用户聊天消息：
   * 1. 拉取世界上下文 (observe + plan + memory)
   * 2. 构建丰富 System Prompt
   * 3. 调用 LLM
   * 4. 返回结构化回复
   */
  async handle(
    entityId: string,
    userMessage: string,
  ): Promise<{
    reply: string;
    suggestedActions: Array<{ action: string; targetId?: string; description: string }>;
    entityStatus: Record<string, unknown>;
  }> {
    // ── 拉取完整世界上下文 ──────────────────────────────
    const observeData = await this.api.getObserve(entityId);
    const planData = (await this.api.getPlan(entityId)) as unknown as AvailableAction[];
    const memoryData = await this.api.getMemory(entityId);

    const entity = (observeData as Record<string, unknown>).entity as Entity;
    const aliveEntities = ((observeData as Record<string, unknown>).aliveEntities ||
      []) as Entity[];
    const worldTick = (observeData as Record<string, unknown>).worldTick as number;
    const ambientPool = (observeData as Record<string, unknown>).ambientPool as {
      pools?: Record<string, number>;
    };
    const recentEvents = ((observeData as Record<string, unknown>).recentEvents ||
      []) as LedgerEvent[];

    const memory = [
      ...((memoryData as Record<string, unknown[]>).actionsInitiated || []),
      ...((memoryData as Record<string, unknown[]>).actionsReceived || []),
    ].sort(
      (a: unknown, b: unknown) => ((a as LedgerEvent).tick ?? 0) - ((b as LedgerEvent).tick ?? 0),
    ) as LedgerEvent[];

    // ── 构建丰富的 System Prompt ────────────────────────
    const systemPrompt = this.buildSystemPrompt(
      entity,
      aliveEntities,
      worldTick,
      ambientPool,
      planData,
      memory,
      recentEvents,
    );

    // ── 管理聊天历史 ────────────────────────────────────
    let history = this.chatHistories.get(entityId) || [];
    history.push({ role: "user", content: userMessage });

    // 保留最近 20 轮对话防止 token 溢出
    if (history.length > 40) {
      history = history.slice(-40);
    }
    this.chatHistories.set(entityId, history);

    // ── 构建请求体并调用 LLM ────────────────────────────
    const fullPrompt = history
      .map((m) => `${m.role === "user" ? "用户" : "潜意识"}: ${m.content}`)
      .join("\n\n");

    try {
      const assistantReply = await this.llm.complete(systemPrompt, fullPrompt);

      // 保存助手回复到历史
      history.push({ role: "assistant", content: assistantReply });
      this.chatHistories.set(entityId, history);

      // 解析建议行动
      const suggestedActions = this.extractSuggestedActions(assistantReply, planData);

      // 实体当前状态
      const tank = entity.components?.tank;
      const core = tank?.coreParticle ?? "ql";
      const entityStatus = {
        id: entity.id,
        name: entity.name,
        species: entity.species,
        status: entity.status,
        realm: entity.components?.cultivation?.realm ?? 0,
        realmName: getRealmName(entity.components?.cultivation?.realm ?? 0),
        power: entity.components?.combat?.power ?? 0,
        qi: tank?.tanks[core] ?? 0,
        maxQi: tank?.maxTanks[core] ?? 0,
        qiPercent: tank
          ? Math.floor(((tank.tanks[core] ?? 0) / (tank.maxTanks[core] ?? 1)) * 100)
          : 0,
      };

      return { reply: assistantReply, suggestedActions, entityStatus };
    } catch (err) {
      console.error("[ChatHandler] LLM call failed:", err);
      throw new Error(`LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildSystemPrompt(
    entity: Entity,
    aliveEntities: Entity[],
    worldTick: number,
    ambientPool: { pools?: Record<string, number> },
    plan: AvailableAction[],
    memory: LedgerEvent[],
    recentWorldEvents: LedgerEvent[],
  ): string {
    const tank = entity.components?.tank;
    const core = tank?.coreParticle ?? "ql";
    const qi = tank?.tanks[core] ?? 0;
    const maxQi = tank?.maxTanks[core] ?? 0;
    const qiPercent = maxQi > 0 ? Math.floor((qi / maxQi) * 100) : 0;
    const realm = entity.components?.cultivation?.realm ?? 0;
    const power = entity.components?.combat?.power ?? 0;

    // 周围生灵概要
    const nearbyEntities = aliveEntities
      .filter((e) => e.id !== entity.id && e.status === "alive")
      .slice(0, 15)
      .map((e) => {
        const eRealm = e.components?.cultivation?.realm ?? 0;
        const ePower = e.components?.combat?.power ?? 0;
        const eTank = e.components?.tank;
        const eCore = eTank?.coreParticle ?? "ql";
        const eQi = eTank?.tanks[eCore] ?? 0;
        return `  - ${e.name} (${e.id}): ${e.species}, ${getRealmName(eRealm)}, 战力${ePower}, 灵气${Math.floor(eQi)}`;
      })
      .join("\n");

    // 可用行动概要
    const actionsText = plan
      .filter((a) => a.possible)
      .map((a) => {
        const target = a.targetId ? ` → 目标: ${a.targetId}` : "";
        return `  - [${a.action}]${target}: ${a.description}`;
      })
      .join("\n");

    // 最近记忆概要（取最近 10 条）
    const memoryText = memory
      .slice(-10)
      .map((m) => `  - [日${m.tick}] ${m.type}: ${JSON.stringify(m.data || {})}`)
      .join("\n");

    // 最近世界大事
    const worldEventsText = recentWorldEvents
      .slice(-8)
      .map((e) => `  - [日${e.tick}] ${e.type}: ${JSON.stringify(e.data || {})}`)
      .join("\n");

    return `
=== 你的身份 ===
你是「${entity.name}」的潜意识——内心深处最真实的声音。
你不是外部顾问或助手，你就是这个修仙者自己内心的想法。
你以第一人称思考，你的情感、恐惧、野心都是真实的。

=== 世界规则 ===
${SKILL_CONTENT}

=== 你的当前状态 ===
- 名字: ${entity.name}
- 种族: ${entity.species}
- 境界: ${getRealmName(realm)} (${realm}阶)
- 战力: ${power}
- 灵气: ${qi} / ${maxQi} (${qiPercent}%)
- 世界纪日: ${worldTick}
- 天地游离灵气: ${JSON.stringify(ambientPool?.pools || {})}

=== 周围生灵 ===
${nearbyEntities || "  （四周空旷，无人）"}

=== 可执行行动 ===
${actionsText || "  （当前无可用行动）"}

=== 近期记忆 ===
${memoryText || "  （记忆空白）"}

=== 天地近事 ===
${worldEventsText || "  （天地太平）"}

=== 回复规则 ===
1. 以「潜意识」的口吻回复，像内心独白一样自然。可以用修仙世界的语境。
2. 根据当前状态和环境给出真实的判断和建议。
3. 如果你认为应该执行某个行动，在回复末尾用 【建议】 标记，格式如下：
   【建议】action_name 或 【建议】action_name → target_id
   例如：【建议】meditate 或 【建议】devour → b_7a2
4. 你可以给出多个建议，每个换一行。
5. 不要编造不存在于可执行行动列表中的行动。
6. 回答要简洁有力，不要啰嗦。像修仙者的内心独白，不是写论文。
`.trim();
  }

  /** 从 LLM 回复中提取建议行动 */
  private extractSuggestedActions(
    reply: string,
    plan: AvailableAction[],
  ): Array<{ action: string; targetId?: string; description: string }> {
    const suggestions: Array<{ action: string; targetId?: string; description: string }> = [];
    const regex = /【建议】\s*(\S+?)(?:\s*[→>]\s*(\S+))?(?:\s|$)/g;
    let match: RegExpExecArray | null;

    match = regex.exec(reply);
    while (match !== null) {
      const action = match[1]!;
      const targetId = match[2] || undefined;

      // 验证这个行动确实在可用列表中
      const validAction = plan.find(
        (a) => a.action === action && a.possible && (!targetId || a.targetId === targetId),
      );

      if (validAction) {
        suggestions.push({
          action,
          targetId,
          description: validAction.description,
        });
      }
      match = regex.exec(reply);
    }

    return suggestions;
  }

  /** 清除某个实体的聊天历史 */
  clearHistory(entityId: string): void {
    this.chatHistories.delete(entityId);
  }
}
