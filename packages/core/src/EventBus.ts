// ============================================================
// EventBus — typed pub/sub for world events
// ============================================================

import type { WorldEvent } from "./world/types.js";

export type EventHandler = (event: WorldEvent) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();
  private _nextIndex = 1;

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

  /** Emit an event (auto-populates global index) */
  emit(event: Omit<WorldEvent, "index">): WorldEvent {
    const fullEvent = { ...event, index: this._nextIndex++ } as WorldEvent;

    const typeHandlers = this.handlers.get(fullEvent.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(fullEvent);
      }
    }
    for (const handler of this.globalHandlers) {
      handler(fullEvent);
    }

    return fullEvent;
  }

  /** Remove all handlers and reset index */
  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
    this._nextIndex = 1;
  }
}
