// ============================================================
// TribulationGenerator — Dynamically crafts a Tribulation Graph
// ============================================================

import { GraphValidator } from "../../../effects/GraphValidator.js";
import type { ActionGraphDef } from "../../../effects/types.js";
import type { Entity } from "../../../types.js";

export const TribulationGenerator = {
  /**
   * Generates a dynamic Tribulation (天劫) ActionGraph.
   * Based on the realm reached, it creates multiple stages of lightning strikes
   * and an inner demon challenge at the end.
   */
  generate(entity: Entity, targetRealm: number): ActionGraphDef {
    const graphId = `tribulation_${entity.id}_${Date.now()}`;
    const graph: ActionGraphDef = {
      id: graphId,
      name: `九天雷劫 (第${targetRealm}重)`,
      description: `天地法则对跨越维度生物的考验，共有 ${targetRealm} 道雷劫。`,
      entryNode: "thunder_1",
      species: [entity.species],
      nodes: [],
      edges: [],
    };

    // Calculate how many lightning strikes based on realm
    const strikeCount = targetRealm;

    // Build all thunder nodes first
    for (let i = 1; i <= strikeCount; i++) {
      graph.nodes.push({
        nodeId: `thunder_${i}`,
        actionId: "lightning_strike",
      });
    }

    // Then link them
    for (let i = 1; i < strikeCount; i++) {
      GraphValidator.addEdgeSafely(graph, {
        from: `thunder_${i}`,
        to: `thunder_${i + 1}`,
        condition: "on_success",
      });
    }

    // After all strikes, Inner Demon (心魔) for Realm >= 3
    if (targetRealm >= 3) {
      const finalThunderId = `thunder_${strikeCount}`;
      const mindNodeId = "inner_demon";
      graph.nodes.push({
        nodeId: mindNodeId,
        actionId: "inner_demon",
      });

      GraphValidator.addEdgeSafely(graph, {
        from: finalThunderId,
        to: mindNodeId,
        condition: "on_success",
      });
    }

    return graph;
  },
};
