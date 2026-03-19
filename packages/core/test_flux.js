import { World } from "./dist/index.js";

const world = new World();
console.log("Initial tick:", world.tick);

const e1 = world.createEntity("Player", "human");
const e2 = world.createEntity("Target", "beast");
console.log(`Entities: ${e1.id}, ${e2.id}`);

let tickTriggered = 0;
world.events.onAny((e) => {
  if (e.type === "tick_complete") {
    tickTriggered++;
    console.log(`[Event] Tick Advanced to ${e.tick}`);
  } else if (e.type === "entity_breakthrough") {
    console.log(`[Event] Breakthrough:`, e.message);
  } else if (e.type === "entity_devoured") {
    console.log(`[Event] Devour:`, e.message);
  }
});

console.log("Starting meditate loop...");
for (let i = 0; i < 100; i++) {
  world.performAction(e1.id, "meditate");
}

console.log(`Tick after 100 meditate: ${world.tick} (Ticks triggered: ${tickTriggered})`);

console.log("Performing Devour...");
world.performAction(e1.id, "devour", e2.id);
console.log(`Tick after devour: ${world.tick}`);

console.log(`Current Qi: ${e1.components.qi.current}/${e1.components.qi.max}`);
// Force max Qi to test breakthrough
e1.components.qi.current = e1.components.qi.max;
console.log("Performing Breakthrough...");
world.performAction(e1.id, "breakthrough");

console.log(`Final Player Realm: ${e1.components.cultivation?.realm}`);
console.log(`Final Tick: ${world.tick}`);
