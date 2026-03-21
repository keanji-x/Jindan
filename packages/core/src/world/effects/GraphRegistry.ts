// ============================================================
// GraphRegistry — stores static ActionGraphDef definitions
// ============================================================

import type { ActionGraphDef } from "./types.js";

const graphs = new Map<string, ActionGraphDef>();

export const GraphRegistry = {
  register(graph: ActionGraphDef) {
    graphs.set(graph.id, graph);
  },

  get(id: string): ActionGraphDef | undefined {
    return graphs.get(id);
  },

  getAll(): ActionGraphDef[] {
    return Array.from(graphs.values());
  },

  _reset() {
    graphs.clear();
  },
};
