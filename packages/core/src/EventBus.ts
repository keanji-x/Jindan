// ============================================================
// EventBus — typed pub/sub for world events
// ============================================================

import type { WorldEvent } from "./world/types.js";

export type EventHandler = (event: WorldEvent) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();

  /** Subscribe to a specific event type */
  on(type: string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  /** Subscribe to ALL events (for logging / WebSocket broadcast) */
  onAny(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  /** Emit an event */
  emit(event: WorldEvent): void {
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(event);
      }
    }
    for (const handler of this.globalHandlers) {
      handler(event);
    }
  }

  /** Remove all handlers */
  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}
