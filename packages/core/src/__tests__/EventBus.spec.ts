import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../EventBus.js";

describe("EventBus", () => {
  let eb: EventBus;

  beforeEach(() => {
    eb = new EventBus();
  });

  it("should subscribe to and emit specific events", () => {
    const handler = vi.fn();
    eb.on("test-event", handler);

    eb.emit({ type: "test-event" } as any);
    eb.emit({ type: "other-event" } as any);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "test-event", index: 1 }));
  });

  it("should accurately increment event index across emits", () => {
    const handler = vi.fn();
    eb.on("test", handler);

    eb.emit({ type: "test" } as any);
    eb.emit({ type: "test" } as any);

    expect(handler).toHaveBeenNthCalledWith(1, expect.objectContaining({ index: 1 }));
    expect(handler).toHaveBeenNthCalledWith(2, expect.objectContaining({ index: 2 }));
  });

  it("should allow unsubscribing from specific events", () => {
    const handler = vi.fn();
    const unsubscribe = eb.on("test-event", handler);

    eb.emit({ type: "test-event" } as any);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    eb.emit({ type: "test-event" } as any);
    expect(handler).toHaveBeenCalledTimes(1); // Should not increase
  });

  it("should broadcast to all using onAny", () => {
    const anyHandler = vi.fn();
    const specificHandler = vi.fn();

    eb.onAny(anyHandler);
    eb.on("foo", specificHandler);

    eb.emit({ type: "foo" } as any);
    eb.emit({ type: "bar" } as any);

    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(anyHandler).toHaveBeenCalledTimes(2);

    expect(anyHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: "foo", index: 1 }),
    );
    expect(anyHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: "bar", index: 2 }),
    );
  });

  it("should allow unsubscribing from onAny", () => {
    const anyHandler = vi.fn();
    const unsubscribeAny = eb.onAny(anyHandler);

    eb.emit({ type: "tick" } as any);
    expect(anyHandler).toHaveBeenCalledTimes(1);

    unsubscribeAny();

    eb.emit({ type: "tick" } as any);
    expect(anyHandler).toHaveBeenCalledTimes(1); // Should not increase
  });

  it("should clear all handlers and reset index", () => {
    const handler = vi.fn();
    eb.on("test", handler);
    eb.onAny(handler);

    eb.emit({ type: "test" } as any);
    expect(handler).toHaveBeenCalledTimes(2); // once for 'test', once for 'any'

    eb.clear();

    eb.emit({ type: "test" } as any);
    expect(handler).toHaveBeenCalledTimes(2); // no new calls

    // Test index reset
    const newHandler = vi.fn();
    eb.on("test", newHandler);
    eb.emit({ type: "test" } as any);
    expect(newHandler).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }));
  });
});
