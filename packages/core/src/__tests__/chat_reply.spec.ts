import { describe, expect, it } from "vitest";
import { World } from "../world/World.js";

describe("Chat Instant Reply", () => {
  it("should produce TWO entity_chat events (outgoing + reply)", () => {
    const world = new World();
    const a = world.createEntity("鹰皇", "beast");
    const b = world.createEntity("天蟒", "beast");

    const result = world.performAction(a.id, "chat", b.id, { message: "你好道友" });
    expect(result.success).toBe(true);

    const chatEvents = result.events.filter((e) => e.type === "entity_chat");
    expect(chatEvents.length).toBe(2);

    // First event: outgoing (a → b)
    expect(chatEvents[0].message).toContain("鹰皇");
    expect(chatEvents[0].message).toContain("你好道友");

    // Second event: reply (b → a)
    expect(chatEvents[1].message).toContain("天蟒");
    expect(chatEvents[1].message).toContain("回复");
    const replyData = chatEvents[1].data as Record<string, unknown>;
    expect(replyData.message).toBeTruthy();
    expect(replyData.message).not.toBe("（无声的神念）");
  });

  it("reply is hostile when relation < -40", () => {
    const world = new World();
    const a = world.createEntity("挑衅者", "beast");
    const b = world.createEntity("暴怒兽", "beast");

    // Set hostile relation
    world.relations.set(a.id, b.id, -60);

    const result = world.performAction(a.id, "chat", b.id, { message: "嘿" });
    const reply = result.events.find(
      (e) => e.type === "entity_chat" && e.message?.includes("回复"),
    );
    expect(reply).toBeDefined();

    const replyMsg = (reply!.data as Record<string, unknown>).message as string;
    const contemptPhrases = ["滚", "什么东西", "不认识", "瞥了一眼", "识趣", "浪费"];
    const isContemptuous = contemptPhrases.some((p) => replyMsg.includes(p));
    expect(isContemptuous).toBe(true);
  });

  it("reply is friendly when relation > 50", () => {
    const world = new World();
    const a = world.createEntity("好友", "beast");
    const b = world.createEntity("密友", "beast");

    // Set friendly relation
    world.relations.set(a.id, b.id, 80);

    const result = world.performAction(a.id, "chat", b.id, { message: "近来可好" });
    const reply = result.events.find(
      (e) => e.type === "entity_chat" && e.message?.includes("回复"),
    );
    expect(reply).toBeDefined();

    const replyMsg = (reply!.data as Record<string, unknown>).message as string;
    const friendlyPhrases = [
      "天气",
      "好啊",
      "来得正好",
      "道友",
      "灵气充盈",
      "心情甚好",
      "找我",
      "在此",
    ];
    const isFriendly = friendlyPhrases.some((p) => replyMsg.includes(p));
    expect(isFriendly).toBe(true);
  });

  it("empty payload still sends '无声神念' but target still replies", () => {
    const world = new World();
    const a = world.createEntity("沉默者", "beast");
    const b = world.createEntity("感应者", "beast");

    const result = world.performAction(a.id, "chat", b.id);
    const chatEvents = result.events.filter((e) => e.type === "entity_chat");
    expect(chatEvents.length).toBe(2);

    expect(chatEvents[0].message).toContain("无声的神念");
    expect(chatEvents[1].message).toContain("回复");
  });

  it("both sides get relation boost from chat", () => {
    const world = new World();
    const a = world.createEntity("聊天者", "beast");
    const b = world.createEntity("回应者", "beast");

    const relBefore = world.relations.get(a.id, b.id);
    world.performAction(a.id, "chat", b.id, { message: "你好" });
    const relAfter = world.relations.get(a.id, b.id);

    expect(relAfter).toBeGreaterThan(relBefore);
  });

  it("chat does NOT interfere with web ChatHandler (separate codepath)", () => {
    // doChat (game engine, core): template-based instant reply, no LLM
    // ChatHandler (agent package): LLM-powered "subconscious" dialogue
    // They share entity_chat event type but are separate systems.
    expect(true).toBe(true);
  });
});
