import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRelay } from "../AgentRelay.js";

describe("AgentRelay", () => {
  let relay: AgentRelay;

  beforeEach(() => {
    vi.useFakeTimers();
    relay = new AgentRelay();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should mark agent online after heartbeat", () => {
    expect(relay.isOnline("agent1")).toBe(false);
    relay.heartbeat("agent1");
    expect(relay.isOnline("agent1")).toBe(true);
    expect(relay.getOnlineAgents()).toContain("agent1");
  });

  it("should mark agent offline if no heartbeat within 5 seconds", () => {
    relay.heartbeat("agent1");
    vi.advanceTimersByTime(5001);
    expect(relay.isOnline("agent1")).toBe(false);
  });

  it("should reject enqueueChat if agent is offline", async () => {
    await expect(relay.enqueueChat("agent1", "hello")).rejects.toThrow(/角色离线/);
  });

  it("should enqueue and resolve chat when agent resolves it", async () => {
    relay.heartbeat("agent1");

    // Start chat promise
    const chatPromise = relay.enqueueChat("agent1", "hello");

    // Agent gets pending chat via heartbeat
    const pending = relay.heartbeat("agent1");
    expect(pending.length).toBe(1);
    expect(pending[0].message).toBe("hello");

    // Agent resolves it
    const success = relay.resolveChat(pending[0].chatId, { reply: "world" });
    expect(success).toBe(true);

    const result = await chatPromise;
    expect(result.reply).toBe("world");
  });

  it("should timeout if agent never resolves the chat", async () => {
    relay.heartbeat("agent1");
    const chatPromise = relay.enqueueChat("agent1", "hello");

    vi.advanceTimersByTime(30001);

    await expect(chatPromise).rejects.toThrow(/等待回复超时/);
  });
});
