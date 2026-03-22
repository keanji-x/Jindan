// ============================================================
// WorldEvaluator — Fitness function for world balance assessment
//
// Scores a headless simulation on 6 dimensions.
// Standalone tool — does NOT depend on vitest.
// ============================================================

import { AiRegistry } from "../../src/world/brains/OptimizerRegistry.js";
import { ActionRegistry } from "../../src/world/systems/ActionRegistry.js";
import { UNIVERSE } from "../../src/world/config/universe.config.js";
import { World } from "../../src/world/World.js";

export interface WorldScore {
  total: number;
  playerSurvival: number;
  speciesDiversity: number;
  breakthroughRate: number;
  ecosystemHealth: number;
  ambientEntityRatio: number;
  shaLingRatio: number;
  actionDiversity: number;
}

export interface EvalOptions {
  ticks: number;
  maxIterations?: number;
  /** Number of entities to pre-populate (default: let SpawnPool handle it) */
  entities?: number;
  /** Particles per entity ratio — totalParticles = entities × this (default: 100) */
  particlesPerEntity?: number;
}

export interface RobustScore {
  mean: WorldScore;
  std: WorldScore;
  fitness: number; // mean.total - α * std.total
}

export function evaluateWorld(opts: EvalOptions): WorldScore {
  // ── Temporarily scale world if requested ──
  const origTotal = UNIVERSE.totalParticles;
  const origMax = UNIVERSE.ecology.maxEntities;
  if (opts.entities) {
    const ppe = opts.particlesPerEntity ?? 100;
    UNIVERSE.totalParticles = opts.entities * ppe;
    UNIVERSE.ecology.maxEntities = opts.entities + 10;
  }

  const world = new World();
  const player = world.createEntity("评测者", "human");
  const playerId = player.id;

  // Pre-populate entities in balanced species mix
  if (opts.entities) {
    const npcSpecies = Object.entries(UNIVERSE.reactors)
      .filter(([, r]) => r.npcNames && r.npcNames.length > 0)
      .map(([id, r]) => ({ id, names: r.npcNames! }));

    if (npcSpecies.length > 0) {
      const count = opts.entities - 1; // -1 for player
      for (let i = 0; i < count; i++) {
        const sp = npcSpecies[i % npcSpecies.length]!;
        const name = sp.names[i % sp.names.length]! + (i < sp.names.length ? "" : `#${i}`);
        try {
          world.createEntity(name, sp.id as any);
        } catch {
          break; // ambient pool exhausted
        }
      }
    }
  }

  const totalTicks = opts.ticks;
  const maxIter = opts.maxIterations ?? totalTicks * 20;

  let playerAliveTicks = 0;
  let diversitySum = 0;
  let ecosystemSum = 0;
  let breakthroughs = 0;
  let ambientEntitySum = 0;
  let shaLingSum = 0;
  let actionDiversitySum = 0;
  let ticksSeen = 0;
  const actionsThisTick = new Set<string>();

  const initialEntityCount = world.getAliveEntities().length;

  world.events.onAny((e) => {
    if (e.type === "entity_breakthrough") {
      breakthroughs++;
    }
  });

  let iterations = 0;
  while (world.tick < totalTicks && iterations < maxIter) {
    iterations++;
    actionsThisTick.clear();

    const npcs = world.getAliveEntities().filter((e) => e.components.brain);

    for (const npc of npcs) {
      if (npc.status !== "alive") continue;
      const brain = AiRegistry.get(npc.components.brain!.id);
      if (!brain) continue;

      const actions = world.getAvailableActions(npc.id);
      if (actions.length === 0) continue;

      const tank = npc.components.tank;
      const core = tank?.coreParticle ?? "ql";
      const qiCurrent = tank ? (tank.tanks[core] ?? 0) : 0;
      const realm = npc.components.cultivation?.realm ?? 1;
      const reactor = UNIVERSE.reactors[npc.species];
      const qiMax = reactor
        ? Math.floor(reactor.proportionLimit(realm) * UNIVERSE.totalParticles)
        : 1;
      const qiRatio = qiMax > 0 ? qiCurrent / qiMax : 0;
      const brainCtx = { qiCurrent, qiMax, qiRatio, mood: npc.components.mood?.value ?? 0.5, brainDepth: reactor?.brainDepth };

      const plan = brain.decidePlan
        ? brain.decidePlan(actions, brainCtx)
        : (() => { const d = brain.decide(actions, brainCtx); return d ? [d] : []; })();

      for (const decision of plan) {
        const current = world.getEntity(npc.id);
        if (!current || current.status !== "alive") break;
        world.performAction(npc.id, decision.action, decision.targetId);
        actionsThisTick.add(decision.action);
      }
    }

    const playerEntity = world.getEntity(playerId);
    if (playerEntity?.status === "alive") {
      const pActions = world.getAvailableActions(playerId);
      const playerBrain = AiRegistry.get(playerEntity.components.brain?.id ?? "heuristic_optimizer");
      if (playerBrain && pActions.length > 0) {
        const pTank = playerEntity.components.tank;
        const pCore = pTank?.coreParticle ?? "ql";
        const pQi = pTank ? (pTank.tanks[pCore] ?? 0) : 0;
        const pRealm = playerEntity.components.cultivation?.realm ?? 1;
        const pReactor = UNIVERSE.reactors[playerEntity.species];
        const pMax = pReactor ? Math.floor(pReactor.proportionLimit(pRealm) * UNIVERSE.totalParticles) : 1;
        const pRatio = pMax > 0 ? pQi / pMax : 0;
        const pCtx = { qiCurrent: pQi, qiMax: pMax, qiRatio: pRatio, mood: playerEntity.components.mood?.value ?? 0.5, brainDepth: pReactor?.brainDepth };

        const pPlan = playerBrain.decidePlan
          ? playerBrain.decidePlan(pActions, pCtx)
          : (() => { const d = playerBrain.decide(pActions, pCtx); return d ? [d] : []; })();

        for (const pDecision of pPlan) {
          const current = world.getEntity(playerId);
          if (!current || current.status !== "alive") break;
          world.performAction(playerId, pDecision.action, pDecision.targetId);
          actionsThisTick.add(pDecision.action);
        }
      }
    }

    world.settle();

    if (world.tick > ticksSeen) {
      const newTicks = world.tick - ticksSeen;
      for (let t = 0; t < newTicks; t++) {
        ticksSeen++;

        const alive = world.getAliveEntities();
        const playerAlive = alive.some((e) => e.id === playerId);

        if (playerAlive) playerAliveTicks++;

        const uniqueSpecies = new Set(alive.map((e) => e.species)).size;
        const totalSpeciesTypes = Object.keys(UNIVERSE.reactors).filter(
          (k) => k !== "dao" && k !== "sect" && !k.startsWith("artifact"),
        ).length;
        diversitySum += totalSpeciesTypes > 0 ? Math.min(uniqueSpecies / totalSpeciesTypes, 1) : 0;

        ecosystemSum += alive.length / Math.max(initialEntityCount, 1);

        const snap = world.getSnapshot();
        const ambientQl = snap.daoTanks.ql ?? 0;
        const ambientQs = snap.daoTanks.qs ?? 0;
        const totalAmbient = ambientQl + ambientQs;
        let totalEntity = 0;
        for (const e of alive) {
          const tk = e.components.tank;
          if (tk) totalEntity += Object.values(tk.tanks).reduce((a, b) => a + b, 0);
        }
        const totalQi = totalAmbient + totalEntity;
        ambientEntitySum += totalQi > 0 ? totalAmbient / totalQi : 0.5;

        const totalAmb = ambientQl + ambientQs;
        shaLingSum += totalAmb > 0 ? ambientQs / totalAmb : 0.5;

        // Action diversity: unique actions this tick / total registered action types
        const totalActionTypes = ActionRegistry.getAll().length || 1;
        actionDiversitySum += actionsThisTick.size / totalActionTypes;
      }
    }
  }

  const actualTicks = Math.max(ticksSeen, 1);
  const playerSurvival = playerAliveTicks / actualTicks;
  const speciesDiversity = diversitySum / actualTicks;
  const ecosystemHealth = Math.min(ecosystemSum / actualTicks, 1);

  const expectedBt = Math.max(1, Math.floor(actualTicks / 20));
  const breakthroughRate = Math.min(breakthroughs / expectedBt, 1);

  const ambientEntityRatio = ambientEntitySum / actualTicks;
  // 理想 ~70% ambient (环境是源池, 需要充足但不能垄断)
  const ambientEntityScore = 1 - Math.min(Math.abs(ambientEntityRatio - 0.7) * 3, 1);

  const shaLingRatio = shaLingSum / actualTicks;
  const shaLingScore = 1 - Math.min(Math.abs(shaLingRatio - 0.4) * 3, 1);

  const actionDiversity = actionDiversitySum / actualTicks;

  const total =
    0.15 * playerSurvival +
    0.10 * speciesDiversity +
    0.15 * breakthroughRate +
    0.05 * ecosystemHealth +
    0.35 * actionDiversity +   // Core optimization target: action diversity
    0.10 * ambientEntityScore +
    0.10 * shaLingScore;

  // ── Restore UNIVERSE ──
  UNIVERSE.totalParticles = origTotal;
  UNIVERSE.ecology.maxEntities = origMax;

  return {
    total,
    playerSurvival,
    speciesDiversity,
    breakthroughRate,
    ecosystemHealth,
    ambientEntityRatio,
    shaLingRatio,
    actionDiversity,
  };
}

/** Run multiple independent simulations and return mean / std / fitness. */
export function evaluateWorldRobust(
  opts: EvalOptions & { runs?: number; alpha?: number },
): RobustScore {
  const runs = opts.runs ?? 5;
  const alpha = opts.alpha ?? 0.5;
  const scores = Array.from({ length: runs }, () => evaluateWorld(opts));

  const keys: (keyof WorldScore)[] = [
    "total",
    "playerSurvival",
    "speciesDiversity",
    "breakthroughRate",
    "ecosystemHealth",
    "ambientEntityRatio",
    "shaLingRatio",
    "actionDiversity",
  ];

  const mean = {} as WorldScore;
  const std = {} as WorldScore;

  for (const k of keys) {
    const vals = scores.map((s) => s[k]);
    const m = vals.reduce((a, b) => a + b, 0) / runs;
    const variance = vals.reduce((a, v) => a + (v - m) ** 2, 0) / runs;
    mean[k] = m;
    std[k] = Math.sqrt(variance);
  }

  return { mean, std, fitness: mean.total - alpha * std.total };
}
