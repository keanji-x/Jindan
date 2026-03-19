import { describe, expect, it } from "vitest";
import { world } from "./TestHarness.js";

describe("Player Survival", () => {
  it("trace player death cause", () => {
    const h = world();
    const player = h.createHuman("测试玩家");
    const pid = player.id;

    console.log(`\n── Player Death Trace ──`);
    console.log(
      `  Player: ${player.name} id=${pid} qi=100/100 power=${player.components.combat?.power}`,
    );

    // Log all events involving the player
    h.world.events.onAny((e) => {
      const d = e.data;
      // Check if event involves the player
      const isPlayerEvent =
        d.id === pid ||
        (d.winner && (d.winner as { id: string }).id === pid) ||
        (d.loser && (d.loser as { id: string }).id === pid) ||
        (d.entity && (d.entity as { id: string }).id === pid);

      if (isPlayerEvent) {
        console.log(`  [tick=${e.tick}] ${e.type}: ${e.message}`);
      }
    });

    for (let i = 1; i <= 30; i++) {
      const tickBefore = h.world.tick;
      h.simulate(1);
      const tickAfter = h.world.tick;

      const e = h.world.getEntity(pid);
      const qi = e?.components.tank?.tanks[e.components.tank.coreParticle] ?? 0;
      const alive = e?.status === "alive";

      console.log(
        `  --- iteration=${i}: tick ${tickBefore}→${tickAfter}, qi=${qi}, alive=${alive}`,
      );

      if (!alive) {
        console.log(`  ☠️ DEAD at tick ${tickAfter}`);
        break;
      }
    }

    expect(true).toBe(true);
    h.dispose();
  });
});
