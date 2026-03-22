// ============================================================
// AgentTestHarness — offline agent loop testing
//
// Records full chat flow: snapshot → LLM → multi-action → state
// Two LLM modes: Scripted (deterministic) and Heuristic (rules)
// ============================================================

import type { ActionId, AvailableAction, Entity } from "@jindan/core";
import { UNIVERSE, World } from "@jindan/core";

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
      lines.push(`- **Result**: ${r.actionResult.success ? "✅" : `❌ ${r.actionResult.error}`}`);
      lines.push(
        `- **After**: Qi ${r.postState.qi}/${r.postState.maxQi} | Realm ${r.postState.realm} | Status: ${r.postState.entityStatus}`,
      );
      lines.push("");
    }
    return lines.join("\n");
  }
}

// ── DecisionPacket (mirrors agent/src/types.ts) ─────────────

export interface PlanStep {
  action: string;
  targetId?: string;
  reason: string;
}

export interface DecisionPacket {
  innerVoice: string;
  emotion: string;
  shortTermGoal: string;
  plan: PlanStep[];
}

// ── Legacy LlmDecision (still supported for backward compat) ─

export interface LlmDecision {
  thought: string;
  action: string;
  targetId?: string;
}

/** Convert legacy single-action to DecisionPacket */
function legacyToPacket(d: LlmDecision): DecisionPacket {
  return {
    innerVoice: d.thought,
    emotion: "calm",
    shortTermGoal: "",
    plan: [{ action: d.action, targetId: d.targetId, reason: d.thought }],
  };
}

// ── Mock LLM ────────────────────────────────────────────────

/** Scripted mock: returns pre-defined responses in order */
export class ScriptedLlm {
  private idx = 0;
  constructor(private readonly script: (LlmDecision | DecisionPacket)[]) {}

  decide(_observe: CycleRecord["observe"], _plan: AvailableAction[]): DecisionPacket {
    if (this.idx >= this.script.length) {
      return legacyToPacket({ thought: "脚本已耗尽，休息", action: "rest" });
    }
    const item = this.script[this.idx++]!;
    // Detect if legacy format (has 'thought' + 'action') or new format (has 'plan')
    if ("plan" in item && Array.isArray(item.plan)) {
      return item as DecisionPacket;
    }
    return legacyToPacket(item as LlmDecision);
  }
}

/** Heuristic mock: uses simple rules to make decisions (like a real AI would) */
export class HeuristicLlm {
  decide(observe: CycleRecord["observe"], plan: AvailableAction[]): DecisionPacket {
    const possible = plan.filter((a) => a.possible);
    if (possible.length === 0) {
      return legacyToPacket({ thought: "没有可执行的行动，只能休息", action: "rest" });
    }

    const { qiRatio } = observe;
    const steps: PlanStep[] = [];

    // Priority 1: Breakthrough if qi >= 90%
    if (qiRatio >= 0.9) {
      const bt = possible.find((a) => a.action === "breakthrough");
      if (bt) {
        return {
          innerVoice: `灵气充盈度${Math.floor(qiRatio * 100)}%，尝试突破`,
          emotion: "eager",
          shortTermGoal: "突破境界",
          plan: [{ action: "breakthrough", reason: "灵气充盈" }],
        };
      }
    }

    // Priority 2: Devour plants if qi < 80%
    if (qiRatio < 0.8) {
      const devourPlant = possible.find(
        (a) => a.action === "devour" && a.description.includes("plant"),
      );
      if (devourPlant) {
        steps.push({
          action: "devour",
          targetId: devourPlant.targetId,
          reason: "吞噬灵植补充灵气",
        });
      }
    }

    // Priority 3: Meditate to fill up
    const meditate = possible.find(
      (a) => a.action === "meditate" || a.action === "moonlight" || a.action === "photosynth",
    );
    if (meditate) {
      steps.push({ action: meditate.action, reason: "打坐吸纳灵气" });
    }

    // Fallback: rest if no steps planned
    if (steps.length === 0) {
      steps.push({ action: "rest", reason: "暂且休息" });
    }

    return {
      innerVoice: `灵气${Math.floor(qiRatio * 100)}%，${steps[0]!.reason}`,
      emotion: qiRatio < 0.3 ? "fearful" : "calm",
      shortTermGoal: qiRatio < 0.5 ? "补充灵气" : "稳步修炼",
      plan: steps,
    };
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
    species?: string;
    llm: MockLlm;
    world?: World;
  }) {
    this.world = opts.world ?? new World();
    this.log = new ChatLog();
    this.llm = opts.llm;

    const entity = this.world.createEntity(opts.entityName, opts.species ?? "human");
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
    const cult = entity.components.cultivation;
    const reactor = UNIVERSE.reactors[entity.species];
    const maxQi = reactor
      ? Math.floor(reactor.proportionLimit(cult?.realm ?? 1) * UNIVERSE.totalParticles)
      : 1;
    const snapshot = this.world.getSnapshot();

    // ── Observe ──
    const observe: CycleRecord["observe"] = {
      entityId: entity.id,
      entityName: entity.name,
      qi,
      maxQi,
      qiRatio: maxQi > 0 ? qi / maxQi : 0,
      realm: cult?.realm ?? 0,
      power: 0,
      worldTick: this.world.tick,
      aliveCount: snapshot.entities.length,
      ambientQl: snapshot.daoTanks.ql ?? 0,
      ambientQs: snapshot.daoTanks.qs ?? 0,
    };

    // ── Plan ──
    const plan = this.world.getAvailableActions(this._entityId);

    // ── LLM → DecisionPacket ──
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

    // ── Act: execute plan steps serially ──
    const outcomes: Array<{ action: string; success: boolean; error?: string; result?: unknown }> =
      [];

    for (const step of decision.plan) {
      if (!step.action || step.action === "none") continue;
      const res = this.world.performAction(this._entityId, step.action as ActionId, step.targetId);
      outcomes.push({
        action: step.action,
        success: res.success,
        error: res.error,
        result: res.result,
      });
      if (!res.success) break; // abort plan on failure
    }

    const overallSuccess = outcomes.length > 0 && outcomes.every((o) => o.success);
    const primaryAction = decision.plan[0];

    // ── Post-state ──
    const postEntity = this.world.getEntity(this._entityId);
    const postTank = postEntity?.components.tank;
    const postReactor = postEntity ? UNIVERSE.reactors[postEntity.species] : undefined;
    const postRealm = postEntity?.components.cultivation?.realm ?? 1;
    const postMaxQi = postReactor
      ? Math.floor(postReactor.proportionLimit(postRealm) * UNIVERSE.totalParticles)
      : 0;
    const postState: CycleRecord["postState"] = {
      qi: postTank?.tanks[core] ?? 0,
      maxQi: postMaxQi,
      realm: postRealm,
      tick: this.world.tick,
      entityStatus: postEntity?.status ?? "unknown",
    };

    // ── Record (backward compatible: first action in plan as primary) ──
    this.log.push({
      cycle: cycleNum,
      status: entity.status,
      observe,
      plan,
      llmInput: { system: systemPrompt, user: userPrompt },
      llmOutput: {
        thought: decision.innerVoice,
        action: primaryAction?.action ?? "none",
        targetId: primaryAction?.targetId,
        raw: llmRaw,
      },
      actionResult: {
        success: overallSuccess,
        error: outcomes.find((o) => !o.success)?.error,
        result: outcomes,
      },
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
