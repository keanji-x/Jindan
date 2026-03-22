import * as d3 from "d3";
import { useCallback, useEffect, useRef } from "react";
import type { EntityData, RelationEdge } from "../api/client";

// ── Tag emoji mapping ────────────────────────────────
const TAG_EMOJI: Record<string, string> = {
  dao_partner: "💕",
  master_disciple: "📖",
  sworn_sibling: "🤝",
  blood_feud: "⚔️",
  friend: "🫂",
  enemy: "💢",
  parent: "👨‍👧",
  child: "👶",
  owner: "🔗",
  owned: "🔗",
  enslaver: "⛓️",
  enslaved: "⛓️",
  sect_member: "🏯",
  sect_leader: "👑",
};

const SPECIES_ICONS: Record<string, string> = {
  human: "🧔",
  beast: "🐗",
  plant: "🌿",
};

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  species: string;
  status: string;
  realm: number;
  isActive: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  score: number;
  tags: string[];
}

interface Props {
  entities: EntityData[];
  relations: Record<string, RelationEdge>;
  activeEntityId: string | null;
}

export default function RelationGraph({ entities, relations, activeEntityId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  const buildGraph = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || 400;

    // Build nodes from entities (alive + lingering)
    const nodeMap = new Map<string, GraphNode>();
    const nodes: GraphNode[] = entities
      .filter((e) => e.status === "alive" || e.status === "lingering")
      .map((e) => {
        const node: GraphNode = {
          id: e.id,
          name: e.name,
          species: e.species || "human",
          status: e.status || "alive",
          realm: e.components?.cultivation?.realm ?? 0,
          isActive: e.id === activeEntityId,
        };
        nodeMap.set(e.id, node);
        return node;
      });

    // Build links from relations (only where both nodes exist)
    const links: GraphLink[] = [];
    for (const [key, edge] of Object.entries(relations)) {
      if (Math.abs(edge.score) < 1 && edge.tags.length === 0) continue;
      const [a, b] = key.split(":");
      if (a && b && nodeMap.has(a) && nodeMap.has(b)) {
        links.push({
          source: a,
          target: b,
          score: edge.score,
          tags: edge.tags || [],
        });
      }
    }

    // Clear previous
    const svgSel = d3.select(svg);
    svgSel.selectAll("*").remove();

    svgSel.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

    // Defs for glow filter
    const defs = svgSel.append("defs");
    const glowFilter = defs.append("filter").attr("id", "glow");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Container for zoom/pan
    const g = svgSel.append("g");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svgSel.call(zoom);

    // Score → color
    function linkColor(score: number): string {
      if (score > 60) return "#34d399"; // emerald
      if (score > 20) return "#6ee7b7"; // light green
      if (score > 0) return "#a7f3d0"; // very light green
      if (score > -20) return "#fca5a5"; // light red
      if (score > -60) return "#f87171"; // red
      return "#ef4444"; // deep red
    }

    // Score → width
    function linkWidth(score: number): number {
      return Math.max(1, Math.min(5, Math.abs(score) / 20));
    }

    // Force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => Math.max(80, 150 - Math.abs(d.score))),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(35));

    simRef.current = simulation;

    // Draw links
    const link = g
      .append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => linkColor(d.score))
      .attr("stroke-width", (d) => linkWidth(d.score))
      .attr("stroke-opacity", 0.7)
      .attr("stroke-dasharray", (d) => (d.score < 0 ? "5,3" : "none"));

    // Tag labels on links
    const linkLabel = g
      .append("g")
      .selectAll<SVGTextElement, GraphLink>("text")
      .data(links.filter((l) => l.tags.length > 0))
      .join("text")
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("pointer-events", "none")
      .text((d) => d.tags.map((t) => TAG_EMOJI[t] || t).join(""));

    // Score labels on links
    const scoreLabel = g
      .append("g")
      .selectAll<SVGTextElement, GraphLink>("text")
      .data(links)
      .join("text")
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", (d) => (d.score >= 0 ? "#6ee7b7" : "#fca5a5"))
      .attr("opacity", 0.8)
      .attr("pointer-events", "none")
      .text((d) => (d.score > 0 ? `+${d.score}` : String(d.score)));

    // Draw nodes
    const node = g
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab");

    // Node circle
    node
      .append("circle")
      .attr("r", (d) => (d.isActive ? 22 : 18))
      .attr("fill", (d) => {
        if (d.status === "lingering") return "rgba(168, 85, 247, 0.15)";
        return "rgba(15, 23, 42, 0.8)";
      })
      .attr("stroke", (d) => {
        if (d.isActive) return "#38bdf8";
        if (d.status === "lingering") return "rgba(168, 85, 247, 0.6)";
        return "rgba(255, 255, 255, 0.15)";
      })
      .attr("stroke-width", (d) => (d.isActive ? 2.5 : 1.5))
      .attr("filter", (d) => (d.isActive ? "url(#glow)" : "none"));

    // Species icon
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", (d) => (d.isActive ? "18px" : "15px"))
      .attr("pointer-events", "none")
      .text((d) => {
        if (d.status === "lingering") return "👻";
        return SPECIES_ICONS[d.species] || "✨";
      });

    // Name label
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 32)
      .attr("font-size", "10px")
      .attr("fill", (d) => {
        if (d.isActive) return "#38bdf8";
        if (d.status === "lingering") return "#a78bfa";
        return "#94a3b8";
      })
      .attr("font-weight", (d) => (d.isActive ? "bold" : "normal"))
      .attr("pointer-events", "none")
      .text((d) => d.name);

    // Drag behavior
    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Tick update
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      linkLabel
        .attr("x", (d) => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr("y", (d) => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2 - 8);

      scoreLabel
        .attr("x", (d) => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr("y", (d) => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2 + 10);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  }, [entities, relations, activeEntityId]);

  useEffect(() => {
    buildGraph();
    return () => {
      simRef.current?.stop();
    };
  }, [buildGraph]);

  // Resize handler
  useEffect(() => {
    const resizeHandler = () => buildGraph();
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, [buildGraph]);

  return (
    <div ref={containerRef} className="w-full h-[400px] relative">
      {entities.length === 0 ? (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm italic">
          <span className="text-4xl mr-3 opacity-50">🌌</span>
          天地初开，尚无生灵结缘...
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-full" style={{ background: "transparent" }} />
      )}
    </div>
  );
}
