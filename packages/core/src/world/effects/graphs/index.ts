// ============================================================
// Built-in ActionGraph Definitions — composite action sequences
//
// These graphs are registered at module load time. They combine
// existing atomic actions into higher-level composite behaviors.
// ============================================================

import { GraphRegistry } from "../GraphRegistry.js";
import type { ActionGraphDef } from "../types.js";

// ── 杀人夺宝 (Kill & Loot) ──────────────────────────────────
// Devour an entity, then acquire their possessions.
// The devour node kills the target; on success, acquire picks up loot.

const KILL_AND_LOOT: ActionGraphDef = {
  id: "kill_and_loot",
  name: "杀人夺宝",
  description: "先吞噬目标夺其灵气，再获取其遗物",
  entryNode: "kill",
  nodes: [
    { nodeId: "kill", actionId: "devour" },
    { nodeId: "loot", actionId: "acquire" },
  ],
  edges: [{ from: "kill", to: "loot", condition: "on_success" }],
  species: ["human", "beast"],
};

// ── 指挥法宝杀人 (Artifact Strike) ──────────────────────────
// First acquire an artifact, then use devour on the enemy.
// This is a simplified version; a full implementation would need
// the artifact to channel its energy into the devour.

const ARTIFACT_STRIKE: ActionGraphDef = {
  id: "artifact_strike",
  name: "御宝杀敌",
  description: "先获取法宝，再驱使法宝攻击目标",
  entryNode: "acquire_artifact",
  nodes: [
    { nodeId: "acquire_artifact", actionId: "acquire" },
    { nodeId: "strike", actionId: "devour" },
  ],
  edges: [{ from: "acquire_artifact", to: "strike", condition: "on_success" }],
  species: ["human"],
};

/** Register all built-in graphs */
export function registerBuiltinGraphs(): void {
  GraphRegistry.register(KILL_AND_LOOT);
  GraphRegistry.register(ARTIFACT_STRIKE);
}
