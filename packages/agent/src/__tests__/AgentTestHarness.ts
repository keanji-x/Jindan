// ============================================================
// AgentTestHarness — offline agent loop testing
//
// Records full chat flow: observe → plan → LLM → action → state
// Two LLM modes: Scripted (deterministic) and Heuristic (rules)
// ============================================================

import { World } from "@jindan/core";
import type { ActionId, AvailableAction, Entity } from "@jindan/core";

// ── Chat Log ────────────────────────────────────────────────

export interface CycleRecord {
  cycle: number;
  /** Entity status before action */
  status: string;
  /** Observe data (world state from entity's perspective) */
  observe: {
    entityId: string;
    entityName: string;
    qi: number;
    maxQi: number;
    qiRatio: number;
    realm: number;
    power: number;
    worldTick: number;
    aliveCount: number;
    ambientQl: number;
    ambientQs: number;
  };
  /** Available actions */
  plan: AvailableAction[];
  /** Prompt sent to LLM */
  llmInput: { system: string; user: string };
  /** LLM response */
  llmOutput: {
    thought: string;
    action: string;
    targetId?: string;
    raw: string;
  };
  /** Action execution result */
  actionResult: { success: boolean; error?: string; result?: unknown };
  /** World state after action */
  postState: {
    qi: number;
    maxQi: number;
    realm: number;
    tick: number;
    entityStatus: string;
  };
}

export class ChatLog {
  readonly records: CycleRecord[] = [];

  push(record: CycleRecord) {
    this.records.push(record);
  }

  /** Export as JSON string */
  toJSON(): string {
    return JSON.stringify(this.records, null, 2);
  }

  /** Export as readable markdown */
  toMarkdown(): string {
    const lines: string[] = ["# Agent Chat Flow Log\n"];
    for (const r of this.records) {
      lines.push(`## Cycle ${r.cycle} (tick=${r.observe.worldTick})`);
      lines.push(
        `- **Status**: ${r.status} | Qi: ${r.observe.qi}/${r.observe.maxQi} (${Math.floor(r.observe.qiRatio * 100)}%) | Realm: ${r.observe.realm}`,
      );
      lines.push(
        `- **Possible actions**: ${r.plan.filter((a) => a.possible).length} / ${r.plan.length}`,
      );
      lines.push(`- **LLM thought**: ${r.llmOutput.thought}`);
      lines.push(
        `- **Action**: ${r.llmOutput.action}${r.llmOutput.targetId ? ` → ${r.llmOutput.targetId}` : ""}`,
      );
      lines.push(
        `- **Result**: ${r.actionResult.success ? "✅" : `❌ ${r.actionResult.error}`}`,
      );
      lines.push(
        `- **After**: Qi ${r.postState.qi}/${r.postState.maxQi} | Realm ${r.postState.realm} | Status: ${r.postState.entityStatus}`,
      );
      lines.push("");
    }
    return lines.join("\n");
  }
}

// ── Mock LLM ────────────────────────────────────────────────

export interface LlmDecision {
  thought: string;
  action: string;
  targetId?: string;
}

/** Scripted mock: returns pre-defined responses in order */
export class ScriptedLlm {
  private idx = 0;
  constructor(private readonly script: LlmDecision[]) {}

  decide(
    _observe: CycleRecord["observe"],
    _plan: AvailableAction[],
  ): LlmDecision {
    if (this.idx >= this.script.length) {
      return { thought: "脚本已耗尽，休息", action: "rest" };
    }
    return this.script[this.idx++]!;
  }
}

/** Heuristic mock: uses simple rules to make decisions (like a real AI would) */
export class HeuristicLlm {
  decide(
    observe: CycleRecord["observe"],
    plan: AvailableAction[],
  ): LlmDecision {
    const possible = plan.filter((a) => a.possible);
    if (possible.length === 0) {
      return { thought: "没有可执行的行动，只能休息", action: "rest" };
    }

    const { qiRatio } = observe;

    // Priority 1: Breakthrough if qi >= 90%
    if (qiRatio >= 0.9) {
      const bt = possible.find((a) => a.action === "breakthrough");
      if (bt) {
        return {
          thought: `灵气充盈度${Math.floor(qiRatio * 100)}%，尝试突破`,
          action: "breakthrough",
        };
      }
    }

    // Priority 2: Devour plants if qi < 80%
    if (qiRatio < 0.8) {
      const devourPlant = possible.find(
        (a) => a.action === "devour" && a.description.includes("plant"),
      );
      if (devourPlant) {
        return {
          thought: `灵气仅${Math.floor(qiRatio * 100)}%，吞噬灵植补充灵气`,
          action: "devour",
          targetId: devourPlant.targetId,
        };
      }
    }

    // Priority 3: Meditate to fill up
    const meditate = possible.find(
      (a) =>
        a.action === "meditate" ||
        a.action === "moonlight" ||
        a.action === "photosynth",
    );
    if (meditate) {
      return {
        thought: `灵气${Math.floor(qiRatio * 100)}%，打坐吸纳灵气`,
        action: meditate.action,
      };
    }

    // Fallback: rest
    return { thought: "无最优策略，暂且休息", action: "rest" };
  }
}

// ── Agent Harness ───────────────────────────────────────────

type MockLlm = ScriptedLlm | HeuristicLlm;

export class AgentHarness {
  readonly world: World;
  readonly log: ChatLog;
  private readonly _entityId: string;
  private readonly llm: MockLlm;

  constructor(opts: {
    entityName: string;
    species?: "human" | "beast" | "plant";
    llm: MockLlm;
    world?: World;
  }) {
    this.world = opts.world ?? new World();
    this.log = new ChatLog();
    this.llm = opts.llm;

    const entity = this.world.createEntity(
      opts.entityName,
      opts.species ?? "human",
    );
    this._entityId = entity.id;
  }

  get entityId(): string {
    return this._entityId;
  }

  getEntity(): Entity | undefined {
    return this.world.getEntity(this._entityId);
  }

  /** Run one OODA cycle. Returns false if entity is dead. */
  runCycle(cycleNum: number): boolean {
    const entity = this.world.getEntity(this._entityId);
    if (!entity || entity.status !== "alive") return false;

    const tank = entity.components.tank!;
    const core = tank.coreParticle;
    const qi = tank.tanks[core];
    const maxQi = tank.maxTanks[core];
    const cult = entity.components.cultivation;
    const combat = entity.components.combat;
    const snapshot = this.world.getSnapshot();

    // ── Observe ──
    const observe: CycleRecord["observe"] = {
      entityId: entity.id,
      entityName: entity.name,
      qi,
      maxQi,
      qiRatio: qi / maxQi,
      realm: cult?.realm ?? 0,
      power: combat?.power ?? 0,
      worldTick: this.world.tick,
      aliveCount: snapshot.entities.length,
      ambientQl: snapshot.ambientPool.pools.ql,
      ambientQs: snapshot.ambientPool.pools.qs,
    };

    // ── Plan ──
    const plan = this.world.getAvailableActions(this._entityId);

    // ── LLM ──
    const systemPrompt = "[AgentTestHarness] Mock System Prompt";
    const userPrompt = `Observe: ${JSON.stringify(observe)}\nPlan: ${JSON.stringify(
      plan.map((a) => ({
        action: a.action,
        targetId: a.targetId,
        desc: a.description,
        possible: a.possible,
      })),
    )}`;

    const decision = this.llm.decide(observe, plan);
    const llmRaw = JSON.stringify(decision);

    // ── Act ──
    let actionResult: CycleRecord["actionResult"];
    if (decision.action && decision.action !== "none") {
      const res = this.world.performAction(
        this._entityId,
        decision.action as ActionId,
        decision.targetId,
      );
      actionResult = {
        success: res.success,
        error: res.error,
        result: res.result,
      };
    } else {
      actionResult = { success: false, error: "No action decided" };
    }

    // ── Post-state ──
    const postEntity = this.world.getEntity(this._entityId);
    const postTank = postEntity?.components.tank;
    const postState: CycleRecord["postState"] = {
      qi: postTank?.tanks[core] ?? 0,
      maxQi: postTank?.maxTanks[core] ?? 0,
      realm: postEntity?.components.cultivation?.realm ?? 0,
      tick: this.world.tick,
      entityStatus: postEntity?.status ?? "unknown",
    };

    // ── Record ──
    this.log.push({
      cycle: cycleNum,
      status: entity.status,
      observe,
      plan,
      llmInput: { system: systemPrompt, user: userPrompt },
      llmOutput: {
        thought: decision.thought,
        action: decision.action,
        targetId: decision.targetId,
        raw: llmRaw,
      },
      actionResult,
      postState,
    });

    return postEntity?.status === "alive";
  }

  /** Run N cycles, returns how many were executed before death/completion */
  run(maxCycles: number): number {
    for (let i = 0; i < maxCycles; i++) {
      if (!this.runCycle(i + 1)) return i + 1;
    }
    return maxCycles;
  }
}
