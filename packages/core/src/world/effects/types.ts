// ============================================================
// Effect & ActionGraph types — declarative effect system
//
// Three-layer architecture:
//   Action (atomic) → ActionGraph (composable DAG) → Effect (declarative)
//
// Effects are pure data — serializable, replayable, testable.
// ============================================================

import type { ParticleId } from "../config/types.js";
import type { ChatMessage, LifeStatus, RelationTag, WorldEvent } from "../types.js";

// ── Effect Types ─────────────────────────────────────────────

/** Transfer particles between containers (entity tanks or ambient pool) */
export interface TransferEffect {
  readonly type: "transfer";
  /** Source: "ambient" or entity ID */
  readonly from: "ambient" | string;
  /** Destination: "ambient" or entity ID */
  readonly to: "ambient" | string;
  /** Particle amounts to transfer */
  readonly amounts: Record<ParticleId, number>;
}

/** Fire incoming beam through an entity's reactor */
export interface ReactorBeamEffect {
  readonly type: "reactor_beam";
  readonly entityId: string;
  /** Incoming particle beam */
  readonly beam: Record<ParticleId, number>;
  /** Source realm (affects reaction intensity) */
  readonly sourceRealm: number;
}

/** Adjust relation score between two entities */
export interface AdjustRelationEffect {
  readonly type: "adjust_relation";
  readonly a: string;
  readonly b: string;
  readonly delta: number;
}

/** Set an entity's lifecycle status */
export interface SetStatusEffect {
  readonly type: "set_status";
  readonly entityId: string;
  readonly status: LifeStatus;
}

/** Set an entity's realm and update proportion limit */
export interface SetRealmEffect {
  readonly type: "set_realm";
  readonly entityId: string;
  readonly realm: number;
  readonly newProportionLimit: number;
}

/** Emit a world event */
export interface EmitEventEffect {
  readonly type: "emit_event";
  readonly event: Omit<WorldEvent, "index">;
}

/** Cascade: trigger another action/graph as a consequence */
export interface CascadeEffect {
  readonly type: "cascade";
  readonly actionId: string;
  readonly entityId: string;
  readonly targetId?: string;
  readonly payload?: unknown;
}

/** Sync entire tank state (useful for resolvers that simulate complex physics) */
export interface SyncTankEffect {
  readonly type: "sync_tank";
  readonly entityId: string;
  readonly tanks: Record<ParticleId, number>;
}

/** Sync entire ambient pool state */
export interface SyncAmbientEffect {
  readonly type: "sync_ambient";
  readonly pools: Record<ParticleId, number>;
}

/** Add a relationship tag between two entities */
export interface AddRelationTagEffect {
  readonly type: "add_relation_tag";
  readonly a: string;
  readonly b: string;
  readonly tag: RelationTag;
}

/** Remove a relationship tag between two entities */
export interface RemoveRelationTagEffect {
  readonly type: "remove_relation_tag";
  readonly a: string;
  readonly b: string;
  readonly tag: RelationTag;
}

/** Create a new entity (used by reproduction actions) */
export interface CreateEntityEffect {
  readonly type: "create_entity";
  readonly name: string;
  readonly species: string;
  /** Parent entity IDs — will be linked via Parent/Child RelationTags */
  readonly parentIds?: string[];
}

/** Adjust an entity's mood value */
export interface AdjustMoodEffect {
  readonly type: "adjust_mood";
  readonly entityId: string;
  /** Change to mood (-1 to +1 range, result clamped to [0, 1]) */
  readonly delta: number;
}

/** Push a chat message into an entity's mailbox */
export interface PushMailboxEffect {
  readonly type: "push_mailbox";
  readonly targetId: string;
  readonly message: ChatMessage;
}

/** Union of all effect types */
export type Effect =
  | TransferEffect
  | ReactorBeamEffect
  | AdjustRelationEffect
  | SetStatusEffect
  | SetRealmEffect
  | EmitEventEffect
  | CascadeEffect
  | SyncTankEffect
  | SyncAmbientEffect
  | AddRelationTagEffect
  | RemoveRelationTagEffect
  | CreateEntityEffect
  | AdjustMoodEffect
  | PushMailboxEffect;

// ── ActionOutcome ────────────────────────────────────────────

/** Action execution status */
export type ActionStatus = "success" | "failure" | "aborted";

/** What a resolver returns: three-state declarative effects */
export interface ActionOutcome {
  status: ActionStatus;

  /** Effects to apply if status is "success" */
  successEffects?: Effect[];
  /** Effects to apply if status is "failure" (e.g. attempted but failed) */
  failureEffects?: Effect[];
  /** Effects to apply if status is "aborted" (e.g. preconditions not met) */
  abortedEffects?: Effect[];

  reason?: string;
  /** Extra data for backward compatibility / UI display */
  [key: string]: unknown;
}

// ── ActionGraph Types ────────────────────────────────────────

/** A node in an ActionGraph = one atomic Action invocation */
export interface ActionNode {
  /** Unique node ID within this graph */
  nodeId: string;
  /** The atomic Action ID to execute */
  actionId: string;
  /** How many times to repeat this node (default 1) */
  repeat?: number;
  /** Target selection strategy */
  targetSelector?: "self" | "same_as_parent" | string;
}

/** An edge between nodes with an optional condition */
export interface ActionEdge {
  /** Source node ID */
  from: string;
  /** Destination node ID */
  to: string;
  /** When to follow this edge (default: "on_success") */
  condition?: EdgeCondition;
}

/** Built-in edge conditions corresponding to outcome status */
export type EdgeCondition = "always" | "on_success" | "on_failure" | "on_aborted";

/** Complete ActionGraph definition */
export interface ActionGraphDef {
  /** Unique graph ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Entry node ID */
  entryNode: string;
  /** All nodes */
  nodes: ActionNode[];
  /** All edges */
  edges: ActionEdge[];
  /** Override total qi cost (if unset, sum of individual action costs) */
  qiCost?: number;
  /** Which species can use this graph (optional, for backward compatibility) */
  species?: string[];
  /** Max executions per tick per entity (default 1) */
  maxPerTick?: number;
}

/** Runtime state of a graph currently being executed by an entity */
export interface ActiveGraph {
  /** The ID of the ActionGraphDef being executed */
  graphId: string;
  /** The ID of the currently active ActionNode within the graph */
  currentNodeId: string;
  /** How many times the current node has been repeated */
  currentRepeatCount: number;
  /** How many ticks the current node has been processing (for multi-tick nodes) */
  ticksHeld: number;
  /** Optional target memorized from the graph invocation */
  targetId?: string;
  /** Optional payload memorized from the graph invocation */
  payload?: unknown;
}

// ── EffectPipeline Types ────────────────────────────────────

/** World context passed to middleware (minimal, no circular deps) */
export interface EffectWorldContext {
  tick: number;
  getEntity: (id: string) => { id: string; species: string; status: string } | undefined;
}

/** Middleware: can inspect, modify, or append effects */
export type EffectMiddleware = (
  effects: Effect[],
  ctx: EffectWorldContext,
  next: () => Effect[],
) => Effect[];
