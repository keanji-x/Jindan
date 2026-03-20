import { expect, test } from "vitest";
import { World } from "../world/World.js";

test("AI Chat functionality", () => {
  const world = new World();
  const player1 = world.createEntity("Player1", "human");
  const ai1 = world.createEntity("AI1", "beast");

  // 1. Invoke chat action from Player1 to AI1
  const result = world.performAction(player1.id, "chat", ai1.id, { message: "Hello AI!" });

  expect(result.success).toBe(true);

  // 2. Target entity's recentEvents in EventGraph receives the chat
  const recentEvents = world.eventGraph.getRecentForEntity(ai1.id);
  const chatEvent = recentEvents.find((e) => (e.type as string) === "entity_chat");
  expect(chatEvent).toBeDefined();
  expect(chatEvent?.sourceId).toBe(player1.id);
  expect(chatEvent?.targetId).toBe(ai1.id);
  expect((chatEvent?.data as Record<string, unknown>)?.message).toBe("Hello AI!");

  // 3. The `entity_chat` event is properly recorded in `WorldEvents`.
  const worldEvent = result.events.find((e) => e.type === "entity_chat");
  expect(worldEvent).toBeDefined();
  expect(worldEvent?.message).toContain("Hello AI!");
});
