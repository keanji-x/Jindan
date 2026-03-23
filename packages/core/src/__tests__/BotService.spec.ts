import { beforeEach, describe, expect, it, vi } from "vitest";
import { BotService } from "../BotService.js";

describe("BotService", () => {
  let bot: BotService;
  let mockWorld: any;
  let mockStorage: any;

  beforeEach(() => {
    process.env.JWT_SECRET = "testsecret";

    mockWorld = {
      createEntity: vi
        .fn()
        .mockImplementation((name, sp) => ({ id: "e1", name, species: sp, status: "alive" })),
      getEntity: vi.fn(),
      setEntity: vi.fn(),
      performAction: vi.fn(),
      events: { emit: vi.fn() },
      currentTick: 0,
    };

    const users: Record<string, any> = {};
    const secrets: Record<string, string> = {};

    mockStorage = {
      hasUser: vi.fn((uname) => !!users[uname]),
      setUser: vi.fn((uname, data) => {
        users[uname] = data;
      }),
      getUser: vi.fn((uname) => users[uname]),
      setSecret: vi.fn((id, hash) => {
        secrets[id] = hash;
      }),
      getSecret: vi.fn((id) => secrets[id]),
      getEntityIdBySecret: vi.fn((hash) => Object.keys(secrets).find((k) => secrets[k] === hash)),
      removeEntity: vi.fn((id) => {
        delete secrets[id];
      }),
    };

    bot = new BotService(mockWorld as any, mockStorage as any);
    bot.stopInactivityCheck(); // prevent timer leaks in tests
  });

  it("should register and login a user successfully", () => {
    const res = bot.register("user1", "securepass", "testcode");
    expect(res.token).toBeDefined();
    expect(res.user.username).toBe("user1");

    const loginRes = bot.userLogin("user1", "securepass");
    expect(loginRes.token).toBeDefined();

    expect(() => bot.userLogin("user1", "wrong")).toThrow(/用户名或密码错误/);
  });

  it("should attach character for user and login as bot", () => {
    bot.register("user1", "securepass", "testcode");
    const loginRes = bot.userLogin("user1", "securepass");

    mockWorld.getEntity.mockReturnValue({
      id: "e1",
      name: "MyChar",
      species: "human",
      status: "alive",
      components: {},
    });

    const charRes = bot.attachCharacterForUser(loginRes.token, "e1");
    expect(charRes.entityId).toBe("e1");
    expect(charRes.secret).toBeDefined();

    const authRes = bot.authenticate(charRes.secret);
    expect(authRes.token).toBeDefined();
    expect(authRes.entityId).toBe("e1");
  });

  it("should anonymous attach successfully", () => {
    mockWorld.getEntity.mockReturnValue({
      id: "e1",
      name: "TestEntity",
      species: "human",
      status: "alive",
      components: {},
    });

    const result = bot.anonymousAttach("e1");
    expect(result.entityId).toBe("e1");
    expect(result.secret).toBeDefined();
    expect(result.secret).toMatch(/^jd_/);

    // Should be able to authenticate with the secret
    const authRes = bot.authenticate(result.secret);
    expect(authRes.entityId).toBe("e1");
  });

  it("should release entity after inactivity check", () => {
    mockWorld.getEntity.mockReturnValue({
      id: "e1",
      name: "TestEntity",
      species: "human",
      status: "alive",
      components: { brain: { id: "external_llm" } },
    });

    const result = bot.anonymousAttach("e1");
    expect(result.secret).toBeDefined();

    // Simulate time passing beyond inactivity timeout
    // Access private lastActivity map via any cast
    const lastActivity = (bot as any).lastActivity as Map<string, number>;
    lastActivity.set("e1", Date.now() - 31 * 60 * 1000); // 31 minutes ago

    bot.checkInactivity();

    // Entity should be released — secret removed
    expect(mockStorage.removeEntity).toHaveBeenCalledWith("e1");
    // Brain should be cleared
    const entity = mockWorld.getEntity("e1");
    expect(entity.components.brain).toBeUndefined();
  });

  it("should return theme messages if chatting with dead entity", async () => {
    bot.register("u1", "pass", "testcode");
    const loginRes = bot.userLogin("u1", "pass");

    // Entity must be alive to be attached
    mockWorld.getEntity.mockReturnValue({ id: "e1", status: "alive", name: "C1", components: {} });
    const char = bot.attachCharacterForUser(loginRes.token, "e1");

    // After attaching, it dies
    mockWorld.getEntity.mockReturnValue({
      id: "e1",
      status: "lingering",
      name: "C1",
      components: {},
    });
    const authRes = bot.authenticate(char.secret);

    const reply = await bot.chat(authRes.token, "hello");
    expect(reply.reply).toMatch(/灵魂飘荡/);
  });

  it("should enqueue chat if alive", async () => {
    bot.register("u1", "pass", "testcode");

    mockWorld.getEntity.mockReturnValue({ id: "e1", status: "alive", name: "C1", components: {} });
    const char = bot.attachCharacterForUser(bot.userLogin("u1", "pass").token, "e1");

    const token = bot.authenticate(char.secret).token;
    bot.relay.heartbeat("e1"); // make online

    // mock enqueueChat rather than waiting
    vi.spyOn(bot.relay, "enqueueChat").mockResolvedValue({
      reply: "bounced",
      suggestedActions: [],
    });

    const reply = await bot.chat(token, "msg");
    expect(reply.reply).toBe("bounced");
  });

  it("should emit entity_released event on inactivity release", () => {
    const emitted: { type: string; data: unknown }[] = [];
    mockWorld.events = { emit: vi.fn((e: any) => emitted.push(e)) };
    mockWorld.currentTick = 42;

    mockWorld.getEntity.mockReturnValue({
      id: "e1",
      name: "TestEntity",
      species: "human",
      status: "alive",
      components: { brain: { id: "external_llm", replyMode: "manual" } },
    });

    const result = bot.anonymousAttach("e1");
    expect(result.secret).toBeDefined();

    // Simulate time passing beyond inactivity timeout
    const lastActivity = (bot as any).lastActivity as Map<string, number>;
    lastActivity.set("e1", Date.now() - 31 * 60 * 1000);

    bot.checkInactivity();

    // Should have emitted entity_released
    const releaseEvent = emitted.find((e) => e.type === "entity_released");
    expect(releaseEvent).toBeDefined();
    expect((releaseEvent!.data as any).entityId).toBe("e1");

    // Entity should be released — secret removed
    expect(mockStorage.removeEntity).toHaveBeenCalledWith("e1");
    // Brain should be cleared + persisted
    const entity = mockWorld.getEntity("e1");
    expect(entity.components.brain).toBeUndefined();
    expect(mockWorld.setEntity).toHaveBeenCalled();
  });

  it("should fallback to template reply when agent is offline", async () => {
    bot.register("u1", "pass", "testcode");

    mockWorld.getEntity.mockReturnValue({
      id: "e1",
      status: "alive",
      name: "TestEntity",
      components: {
        mood: { value: 0.5 },
        tank: { coreParticle: "ql", tanks: { ql: 1000 } },
      },
    });
    const char = bot.attachCharacterForUser(bot.userLogin("u1", "pass").token, "e1");
    const token = bot.authenticate(char.secret).token;

    // Do NOT send heartbeat — Agent is offline
    const reply = await bot.chat(token, "你好");

    // Should get a template reply, not throw "角色离线"
    expect(reply.reply).toBeDefined();
    expect(typeof reply.reply).toBe("string");
    expect(reply.reply.length).toBeGreaterThan(0);
    expect(reply.suggestedActions).toEqual([]);
  });
});
