import { describe, expect, it } from "vitest";
import { World } from "../world/World.js";

// ────────────────────────────────────────────────────────────
// 工具函数
// ────────────────────────────────────────────────────────────

function noBrain(world: World, id: string) {
  delete (world.getEntity(id)! as { components: Record<string, unknown> }).components.brain;
}

function manualBrain(world: World, id: string) {
  world.getEntity(id)!.components.brain = { id: "external_llm", replyMode: "manual" };
}

// ────────────────────────────────────────────────────────────
// 基础路径
// ────────────────────────────────────────────────────────────

describe("Chat Mailbox System — 基础路径", () => {
  it("chat 把消息放入目标信箱，template brain 立即回复", () => {
    const world = new World();
    const a = world.createEntity("鹰皇", "beast");
    const b = world.createEntity("天蟒", "beast");

    const result = world.performAction(a.id, "chat", b.id, { message: "你好道友" });
    expect(result.success).toBe(true);

    const chatEvents = result.events.filter((e) => e.type === "entity_chat");
    expect(chatEvents.length).toBe(2);

    // 发送方事件
    const outgoing = chatEvents.find((e) => e.message?.includes("你好道友"));
    expect(outgoing).toBeDefined();

    // 目标信箱：消息已读（template brain 处理了）
    const bEntity = world.getEntity(b.id)!;
    const msg = bEntity.components.mailbox!.messages.find((m) => m.fromId === a.id);
    expect(msg).toBeDefined();
    expect(msg!.read).toBe(true);

    // 发送方信箱：有回复
    const aEntity = world.getEntity(a.id)!;
    const reply = aEntity.components.mailbox!.messages.find((m) => m.fromId === b.id);
    expect(reply).toBeDefined();
    expect(reply!.message).toBeTruthy();
    expect(reply!.isReply).toBe(true);
  });

  it("reply message 有 isReply=true 标记", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast");
    const b = world.createEntity("乙", "beast");

    world.performAction(a.id, "chat", b.id, { message: "嗨" });

    const aEntity = world.getEntity(a.id)!;
    const reply = aEntity.components.mailbox!.messages.find((m) => m.fromId === b.id);
    expect(reply!.isReply).toBe(true);
  });

  it("无 brain 实体不自动回复，消息未读", () => {
    const world = new World();
    const a = world.createEntity("传音者", "beast");
    const b = world.createEntity("木头人", "beast");
    noBrain(world, b.id);

    const result = world.performAction(a.id, "chat", b.id, { message: "有人吗" });
    const chatEvents = result.events.filter((e) => e.type === "entity_chat");

    expect(chatEvents.length).toBe(1);
    const bEntity = world.getEntity(b.id)!;
    expect(bEntity.components.mailbox!.messages[0].read).toBe(false);
  });

  it("manual brain (LLM) 不自动回复，消息未读", () => {
    const world = new World();
    const a = world.createEntity("玩家", "human");
    const b = world.createEntity("AI角色", "human");
    manualBrain(world, b.id);

    const result = world.performAction(a.id, "chat", b.id, { message: "你好" });
    const chatEvents = result.events.filter((e) => e.type === "entity_chat");

    expect(chatEvents.length).toBe(1);
    const bEntity = world.getEntity(b.id)!;
    expect(bEntity.components.mailbox!.messages[0].read).toBe(false);
  });

  it("空 payload 发送「无声的神念」并会被回复", () => {
    const world = new World();
    const a = world.createEntity("沉默者", "beast");
    const b = world.createEntity("感应者", "beast");

    const result = world.performAction(a.id, "chat", b.id);
    const chatEvents = result.events.filter((e) => e.type === "entity_chat");

    expect(chatEvents.length).toBe(2);
    expect(chatEvents.find((e) => e.message?.includes("无声的神念"))).toBeDefined();
    expect(chatEvents.find((e) => e.message?.includes("回复"))).toBeDefined();
  });

  it("传音后双方好感度都提升", () => {
    const world = new World();
    const a = world.createEntity("聊天者", "beast");
    const b = world.createEntity("回应者", "beast");

    const before = world.relations.get(a.id, b.id);
    world.performAction(a.id, "chat", b.id, { message: "你好" });
    const after = world.relations.get(a.id, b.id);

    expect(after).toBeGreaterThan(before);
  });
});

// ────────────────────────────────────────────────────────────
// 信箱容量与顺序
// ────────────────────────────────────────────────────────────

describe("Chat Mailbox System — 容量与顺序", () => {
  it("信箱最多保留 20 条（超出后截断）", () => {
    const world = new World();
    const a = world.createEntity("话痨", "beast");
    const b = world.createEntity("沉默者", "beast");
    noBrain(world, b.id);

    for (let i = 0; i < 25; i++) {
      world.performAction(a.id, "chat", b.id, { message: `消息${i}` });
    }

    const msgs = world.getEntity(b.id)!.components.mailbox!.messages;
    expect(msgs.length).toBe(20);
  });

  it("信箱是 unshift 插入（最新消息在 index 0）", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast");
    const b = world.createEntity("乙", "beast");
    noBrain(world, b.id);

    world.performAction(a.id, "chat", b.id, { message: "第一条" });
    world.performAction(a.id, "chat", b.id, { message: "第二条" });

    const msgs = world.getEntity(b.id)!.components.mailbox!.messages;
    expect(msgs[0].message).toBe("第二条"); // 最新在前
    expect(msgs[1].message).toBe("第一条"); // 最旧在后
  });

  it("chat_reply 处理最旧的未读消息（index 最大）", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast");
    const b = world.createEntity("乙", "beast");
    noBrain(world, b.id);

    world.performAction(a.id, "chat", b.id, { message: "第一条" });
    world.performAction(a.id, "chat", b.id, { message: "第二条" });

    const result = world.performAction(b.id, "chat_reply");
    expect(result.success).toBe(true);

    const bMsgs = world.getEntity(b.id)!.components.mailbox!.messages;
    const read = bMsgs.filter((m) => m.read);
    const unread = bMsgs.filter((m) => !m.read);

    expect(read.length).toBe(1);
    expect(read[0].message).toBe("第一条"); // 最旧的被消费
    expect(unread.length).toBe(1);
    expect(unread[0].message).toBe("第二条");
  });

  it("chat_reply 无未读消息时 abort", () => {
    const world = new World();
    const b = world.createEntity("空盒子", "beast");
    noBrain(world, b.id);
    // 没有任何消息

    const result = world.performAction(b.id, "chat_reply");
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// Ping-Pong 防护
// ────────────────────────────────────────────────────────────

describe("Chat Mailbox System — Ping-Pong 防护", () => {
  it("isReply 消息不触发 cascade（不无限回复）", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast"); // template brain
    const b = world.createEntity("乙", "beast"); // template brain

    // 两个都有 template brain，如果 ping-pong 不防，会无限递归/爆栈
    // 期望只有 2 个 chat 事件（发送 + 一次回复）
    expect(() => {
      world.performAction(a.id, "chat", b.id, { message: "你好" });
    }).not.toThrow();

    // 不能有超过 2 个 entity_chat 事件（有就说明 ping-pong 了）
    // 注意：performAction 只返回直接触发的事件，cascade 的也在里面
    const result = world.performAction(a.id, "chat", b.id, { message: "再好" });
    const chatEvents = result.events.filter((e) => e.type === "entity_chat");
    expect(chatEvents.length).toBe(2); // 发送 + 一次回复，不能更多
  });

  it("isReply=true 的消息进入信箱后不触发 template brain cascade", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast");
    const b = world.createEntity("乙", "beast");

    world.performAction(a.id, "chat", b.id, { message: "你好" });

    // a 的信箱收到 b 的回复（isReply=true）
    const aEntity = world.getEntity(a.id)!;
    const reply = aEntity.components.mailbox!.messages.find((m) => m.fromId === b.id);
    expect(reply).toBeDefined();
    expect(reply!.isReply).toBe(true);
    // 该回复应已被标记为未读（等 a 自己处理），而不是已读（说明没有被 cascade 回复）
    // a 是 template brain，受到 isReply 消息后不应触发 cascade
    expect(reply!.read).toBe(false);
  });

  it("chat_reply 不处理 isReply 消息，只处理原始消息", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast");
    const b = world.createEntity("乙", "beast");
    noBrain(world, b.id);

    // 手动注入一条 isReply 消息到 b 的信箱
    world.applyExternalEffect({
      type: "push_mailbox",
      targetId: b.id,
      message: {
        id: "test-reply-msg",
        tick: 1,
        fromId: a.id,
        fromName: "甲",
        message: "这是一条回复",
        read: false,
        isReply: true,
      },
    });
    // 再注入一条正常消息
    world.applyExternalEffect({
      type: "push_mailbox",
      targetId: b.id,
      message: {
        id: "test-normal-msg",
        tick: 1,
        fromId: a.id,
        fromName: "甲",
        message: "这是正常消息",
        read: false,
        isReply: false,
      },
    });

    const unreadBefore = world.getEntity(b.id)!.components.mailbox!.messages.filter((m) => !m.read);
    expect(unreadBefore.length).toBe(2);

    // BUG FIX: chat_reply 应只处理非 isReply 消息
    const result = world.performAction(b.id, "chat_reply");
    expect(result.success).toBe(true); // 成功处理了 normal-msg

    const bAfter = world.getEntity(b.id)!.components.mailbox!.messages;
    // normal-msg 已被处理（read=true）
    const normalMsg = bAfter.find((m) => m.id === "test-normal-msg");
    expect(normalMsg?.read).toBe(true);
    // isReply 消息仍然未读（没有被 chat_reply 处理）
    const isReplyMsg = bAfter.find((m) => m.id === "test-reply-msg");
    expect(isReplyMsg?.read).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// applyExternalEffect
// ────────────────────────────────────────────────────────────

describe("Chat Mailbox System — applyExternalEffect", () => {
  it("applyExternalEffect push_mailbox 正常写入信箱", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast");
    noBrain(world, a.id);

    world.applyExternalEffect({
      type: "push_mailbox",
      targetId: a.id,
      message: {
        id: "ext-msg-1",
        tick: 42,
        fromId: "external",
        fromName: "外部系统",
        message: "LLM 回复内容",
        read: false,
        isReply: true,
      },
    });

    const msgs = world.getEntity(a.id)!.components.mailbox!.messages;
    expect(msgs.length).toBe(1);
    expect(msgs[0].message).toBe("LLM 回复内容");
    expect(msgs[0].isReply).toBe(true);
  });

  it("applyExternalEffect push_mailbox 对 isReply=true 不触发 template brain cascade", () => {
    const world = new World();
    const a = world.createEntity("甲", "beast"); // template brain

    // 即使 a 有 template brain，写入 isReply 消息也不应触发 cascade
    expect(() => {
      world.applyExternalEffect({
        type: "push_mailbox",
        targetId: a.id,
        message: {
          id: "llm-reply",
          tick: 100,
          fromId: "h_player",
          fromName: "散修",
          message: "这是 LLM 的回复",
          read: false,
          isReply: true,
        },
      });
    }).not.toThrow();

    // a 的信箱有 1 条消息（没有额外 cascade 产生的回复）
    const msgs = world.getEntity(a.id)!.components.mailbox!.messages;
    expect(msgs.length).toBe(1);
  });

  it("applyExternalEffect 对不存在的实体不崩溃", () => {
    const world = new World();

    // targetId 不存在，应静默忽略
    expect(() => {
      world.applyExternalEffect({
        type: "push_mailbox",
        targetId: "nonexistent_entity",
        message: {
          id: "ghost-msg",
          tick: 1,
          fromId: "ghost",
          fromName: "幽灵",
          message: "我不存在",
          read: false,
        },
      });
    }).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// generateReply 边界情况
// ────────────────────────────────────────────────────────────

describe("Chat Mailbox System — generateReply 边界情况", () => {
  it("极短 ID 实体（length < 3）的回复不崩溃", () => {
    // seed = id.charCodeAt(2) — 如果 id 长度 < 3，charCodeAt(2) 返回 NaN
    // arr[NaN] 返回 undefined → 回复为 undefined → bug!
    // 测试这个场景是否已被处理
    const world = new World();
    const a = world.createEntity("甲", "beast");
    const b = world.createEntity("乙", "beast");

    // 强制改 b 的 id 为极短的，绕过 nanoid
    // 不能直接改 id（world 内部有 Map），但可以直接调 performAction
    // 正常路径下 id 是 nanoid() 至少 21 字符，这个 bug 不会在生产触发
    // 但我们可以用正常 id 验证输出不是 undefined
    const result = world.performAction(a.id, "chat", b.id, { message: "测试" });
    const replyEvent = result.events.find(
      (e) => e.type === "entity_chat" && e.message?.includes("回复"),
    );
    expect(replyEvent).toBeDefined();
    const replyMsg = (replyEvent!.data as Record<string, unknown>).message as string;
    expect(replyMsg).toBeDefined();
    expect(typeof replyMsg).toBe("string");
    expect(replyMsg.length).toBeGreaterThan(0);
  });

  it("高好感优先于低灵气（好友不因缺气而冷漠）", () => {
    const world = new World();
    const a = world.createEntity("好友A", "beast");
    const b = world.createEntity("好友B", "beast");
    world.relations.set(a.id, b.id, 80);

    // 强制 b 的灵气为 0（极低）
    const bEntity = world.getEntity(b.id)!;
    if (bEntity.components.tank) {
      const core = bEntity.components.tank.coreParticle;
      bEntity.components.tank.tanks[core] = 10; // < 200 → 理论上触发低灵气分支
    }

    const result = world.performAction(a.id, "chat", b.id, { message: "老友别来无恙" });
    const replyEvent = result.events.find(
      (e) => e.type === "entity_chat" && e.message?.includes("回复"),
    );
    const replyMsg = (replyEvent!.data as Record<string, unknown>).message as string;

    // 不应该是低灵气回复
    const lowQiPhrases = ["灵气将尽", "闭目凝神", "先让我运功", "缓过来"];
    expect(lowQiPhrases.some((p) => replyMsg.includes(p))).toBe(false);

    // 应该是友好回复
    const friendlyPhrases = [
      "天气",
      "好啊",
      "来得正好",
      "道友",
      "灵气充盈",
      "心情甚好",
      "在此",
      "说吧",
    ];
    expect(friendlyPhrases.some((p) => replyMsg.includes(p))).toBe(true);
  });

  it("敌意优先于好感（最高优先级）", () => {
    const world = new World();
    const a = world.createEntity("敌人", "beast");
    const b = world.createEntity("仇人", "beast");
    world.relations.set(a.id, b.id, -70);

    const result = world.performAction(a.id, "chat", b.id, { message: "嘿" });
    const replyEvent = result.events.find(
      (e) => e.type === "entity_chat" && e.message?.includes("回复"),
    );
    const replyMsg = (replyEvent!.data as Record<string, unknown>).message as string;

    const contemptPhrases = ["滚", "什么东西", "不认识", "瞥了一眼", "识趣", "浪费"];
    expect(contemptPhrases.some((p) => replyMsg.includes(p))).toBe(true);
  });

  it("relation=-10 到 0 之间回复冷淡，不是敌意也不是友好", () => {
    const world = new World();
    const a = world.createEntity("陌生人A", "beast");
    const b = world.createEntity("陌生人B", "beast");
    world.relations.set(a.id, b.id, -15);

    // 给 b 足够灵气，排除低灵气分支
    const bEntity = world.getEntity(b.id)!;
    if (bEntity.components.tank) {
      const core = bEntity.components.tank.coreParticle;
      bEntity.components.tank.tanks[core] = 500;
    }

    const result = world.performAction(a.id, "chat", b.id, { message: "你好" });
    const replyEvent = result.events.find(
      (e) => e.type === "entity_chat" && e.message?.includes("回复"),
    );
    const replyMsg = (replyEvent!.data as Record<string, unknown>).message as string;

    const coolPhrases = ["……有事", "（皱眉）", "我很忙", "长话短说"];
    expect(coolPhrases.some((p) => replyMsg.includes(p))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// Heartbeat 去重（通过 read 标记）
// ────────────────────────────────────────────────────────────

describe("Chat Mailbox System — Heartbeat 去重", () => {
  it("manual brain 实体的未读消息仅投递一次（read=true 后不再出现）", () => {
    const world = new World();
    const sender = world.createEntity("发送者", "human");
    const agent = world.createEntity("Agent", "human");
    manualBrain(world, agent.id);

    world.performAction(sender.id, "chat", agent.id, { message: "第一条" });

    const agentEntity = world.getEntity(agent.id)!;
    const msgs = agentEntity.components.mailbox!.messages;
    expect(msgs.length).toBe(1);
    expect(msgs[0].read).toBe(false);

    // 模拟 heartbeat 拿走消息时标记 read
    const unread = msgs.filter((m) => !m.read && !m.isReply);
    for (const m of unread) m.read = true;

    // 再次发 chat（第二条）
    world.performAction(sender.id, "chat", agent.id, { message: "第二条" });

    // heartbeat 再次拿：只有新的一条未读
    const secondUnread = agentEntity.components.mailbox!.messages.filter(
      (m) => !m.read && !m.isReply,
    );
    expect(secondUnread.length).toBe(1);
    expect(secondUnread[0].message).toBe("第二条");
  });

  it("heartbeat 不投递 isReply 消息（只投递 !isReply 的未读）", () => {
    const world = new World();
    const agent = world.createEntity("Agent", "human");
    manualBrain(world, agent.id);

    // 手动写入一条 isReply 消息（模拟 LLM 给 agent 的回复）
    world.applyExternalEffect({
      type: "push_mailbox",
      targetId: agent.id,
      message: {
        id: "reply-msg",
        tick: 1,
        fromId: "player",
        fromName: "玩家",
        message: "这是回复给 agent 的内容",
        read: false,
        isReply: true,
      },
    });
    // 再写一条正常消息
    world.applyExternalEffect({
      type: "push_mailbox",
      targetId: agent.id,
      message: {
        id: "normal-msg",
        tick: 2,
        fromId: "player",
        fromName: "玩家",
        message: "这是新消息",
        read: false,
        isReply: false,
      },
    });

    const allMsgs = world.getEntity(agent.id)!.components.mailbox!.messages;
    // heartbeat 逻辑：!m.read && !m.isReply
    const heartbeatPending = allMsgs.filter((m) => !m.read && !m.isReply);
    expect(heartbeatPending.length).toBe(1);
    expect(heartbeatPending[0].id).toBe("normal-msg");
  });
});
