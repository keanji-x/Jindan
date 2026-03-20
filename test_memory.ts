import { World } from "./packages/core/src/world/World.js";
import { doDevour } from "./packages/core/src/world/DevourSystem.js";

const w = new World();
const e1 = w.createEntity("Bot1", "human");
const e2 = w.createEntity("Bot2", "human");

// give e2 high power to win
e2.components.combat!.power = 100;

w.performAction(e2.id, "devour", e1.id);

const mem = w.ledger.graph.getEntityHistory(e1.id);
console.log(JSON.stringify(mem, null, 2));
