import { expect, test } from "vitest";
import { World } from "../world/World.js";

test("AI Chat functionality (mailbox)", () => {
  const world = new World();
  const player1 = world.createEntity("Player1", "human");
  const ai1 = world.createEntity("AI1", "beast");

  // 1. Invoke chat action from Player1 to AI1
  const result = world.performAction(player1.id, "chat", ai1.id, { message: "Hello AI!" });

  expect(result.success).toBe(true);

  // 2. Target entity's recentEvents receives the outgoing chat
  const recentEvents = world.eventGraph.getRecentForEntity(ai1.id);
  const chatEvent = recentEvents.find(
    (e) => (e.type as string) === "entity_chat" && e.sourceId === player1.id,
  );
  expect(chatEvent).toBeDefined();
  expect(chatEvent?.sourceId).toBe(player1.id);
  expect(chatEvent?.targetId).toBe(ai1.id);
  expect((chatEvent?.data as Record<string, unknown>)?.message).toBe("Hello AI!");

  // 3. The `entity_chat` event for the outgoing message is in WorldEvents
  const outgoingEvent = result.events.find(
    (e) => e.type === "entity_chat" && e.message?.includes("Hello AI!"),
  );
  expect(outgoingEvent).toBeDefined();

  // 4. The reply event is also present (template brain auto-reply via cascade)
  const replyEvent = result.events.find(
    (e) => e.type === "entity_chat" && e.message?.includes("回复"),
  );
  expect(replyEvent).toBeDefined();
  expect(replyEvent?.message).toContain("AI1");

  // 5. Message is in AI1's mailbox (read=true since template brain processed it)
  const ai1Entity = world.getEntity(ai1.id)!;
  expect(ai1Entity.components.mailbox).toBeDefined();
  const inboxMsg = ai1Entity.components.mailbox!.messages.find((m) => m.fromId === player1.id);
  expect(inboxMsg).toBeDefined();
  expect(inboxMsg!.message).toBe("Hello AI!");
  expect(inboxMsg!.read).toBe(true);
});
