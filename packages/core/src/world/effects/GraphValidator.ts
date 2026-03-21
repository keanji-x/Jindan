// ============================================================
// GraphValidator — validates topological safety of ActionGraphs
// ============================================================

import { ActionRegistry } from "../systems/ActionRegistry.js";
import type { ActionGraphDef } from "./types.js";

export const GraphValidator = {
  /**
   * Validate an ActionGraphDef for topological safety using Action constraints.
   * Checks `cannotFollow` and `cannotPrecede` conditions on graph edges.
   */
  validate(graphDef: ActionGraphDef): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Verify entry node exists
    if (!graphDef.nodes.find((n) => n.nodeId === graphDef.entryNode)) {
      errors.push(`Entry node '${graphDef.entryNode}' not found in nodes list.`);
    }

    // Check all edges against Action constraints
    for (const edge of graphDef.edges) {
      const fromNode = graphDef.nodes.find((n) => n.nodeId === edge.from);
      const toNode = graphDef.nodes.find((n) => n.nodeId === edge.to);

      if (!fromNode || !toNode) {
        errors.push(`Invalid edge: Node not found for ${edge.from} -> ${edge.to}`);
        continue;
      }

      const fromDef = ActionRegistry.get(fromNode.actionId);
      const toDef = ActionRegistry.get(toNode.actionId);

      if (!fromDef)
        errors.push(`Unknown action '${fromNode.actionId}' in node '${fromNode.nodeId}'`);
      if (!toDef) errors.push(`Unknown action '${toNode.actionId}' in node '${toNode.nodeId}'`);
      if (!fromDef || !toDef) continue;

      // Forward check: does the 'to' action blacklist the 'from' action?
      if (toDef.constraints?.cannotFollow?.includes(fromDef.id)) {
        errors.push(
          `Constraint violation: action '${toDef.id}' is blacklisted from following '${fromDef.id}' (Edge ${edge.from}->${edge.to})`,
        );
      }

      // Backward check: does the 'from' action blacklist the 'to' action?
      if (fromDef.constraints?.cannotPrecede?.includes(toDef.id)) {
        errors.push(
          `Constraint violation: action '${fromDef.id}' is blacklisted from preceding '${toDef.id}' (Edge ${edge.from}->${edge.to})`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Safely attempt to add a new edge to a graph, returning false if it violates constraints.
   * Useful for dynamic generation (like Tribulation)
   */
  addEdgeSafely(graphDef: ActionGraphDef, edge: import("./types.js").ActionEdge): boolean {
    graphDef.edges.push(edge);
    const result = GraphValidator.validate(graphDef);
    if (!result.valid) {
      // Revert if invalid
      graphDef.edges.pop();
      return false;
    }
    return true;
  },
};
