import { beforeEach, describe, expect, it } from "vitest";
import { ActionRegistry } from "../world/systems/ActionRegistry.js";
import { TribulationGenerator } from "../world/systems/handlers/tribulation/generator.js";

describe("TribulationGenerator", () => {
  beforeEach(() => {
    ActionRegistry._reset();
    ActionRegistry.registerSystem({
      id: "dummy",
      name: "Dummy",
      actions: [
        {
          id: "lightning_strike",
          name: "Lightning",
          qiCost: 0,
          species: ["human", "beast"],
          needsTarget: false,
        },
        {
          id: "inner_demon",
          name: "Demon",
          qiCost: 0,
          species: ["human", "beast"],
          needsTarget: false,
        },
      ],
      handler: () => ({ success: true, newQi: 0 }),
    } as any);
  });

  it("should generate a graph with specific lightning strikes depending on targetRealm", () => {
    const entity = { id: "e1", species: "human" } as any;
    const graph = TribulationGenerator.generate(entity, 2);

    expect(graph.name).toContain("第2重");
    expect(graph.species).toEqual(["human"]);
    expect(graph.entryNode).toBe("thunder_1");
    // 2 realms = 2 thunder nodes
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].nodeId).toBe("thunder_1");
    expect(graph.nodes[0].actionId).toBe("lightning_strike");
    expect(graph.nodes[1].nodeId).toBe("thunder_2");
    expect(graph.nodes[1].actionId).toBe("lightning_strike");

    // 1 edge: thunder_1 -> thunder_2
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].from).toBe("thunder_1");
    expect(graph.edges[0].to).toBe("thunder_2");
    expect(graph.edges[0].condition).toBe("on_success");
  });

  it("should append inner demon node for realm >= 3", () => {
    const entity = { id: "e2", species: "beast" } as any;
    const graph = TribulationGenerator.generate(entity, 3);

    expect(graph.name).toContain("第3重");
    // 3 thunder nodes + 1 inner demon = 4 nodes
    expect(graph.nodes).toHaveLength(4);

    const mindNode = graph.nodes.find((n) => n.nodeId === "inner_demon");
    expect(mindNode).toBeDefined();
    expect(mindNode?.actionId).toBe("inner_demon");

    // Edges: 1->2, 2->3, 3->inner_demon (total 3 edges)
    expect(graph.edges).toHaveLength(3);
    const finalEdge = graph.edges.find((e) => e.to === "inner_demon");
    expect(finalEdge).toBeDefined();
    expect(finalEdge?.from).toBe("thunder_3");
    expect(finalEdge?.condition).toBe("on_success");
  });
});
