// ============================================================
// DrainSystem — 被动灵气流失 (耗散结构)
// ============================================================

import type { EventBus } from "../../EventBus.js";
import { SPECIES } from "../../entity/index.js";
import type { Entity } from "../../entity/types.js";
import type { AmbientQi } from "../types.js";
import { QI_CONFIG } from "./config.js";

/** Apply passive qi drain to all alive entities. Returns list of entities that died. */
export function drainAll(
  entities: Entity[],
  ambientQi: AmbientQi,
  tick: number,
  events: EventBus,
): Entity[] {
  const died: Entity[] = [];

  for (const entity of entities) {
    if (!entity.alive) continue;

    const template = SPECIES[entity.species]!;
    const drain = QI_CONFIG.drainFormula(
      template.baseQiDrain,
      ambientQi.total,
      ambientQi.current,
    );
    const qiComp = entity.components.qi;
    if (!qiComp) continue;

    const actualDrain = Math.min(Math.floor(drain), qiComp.current);

    qiComp.current -= actualDrain;
    ambientQi.current += actualDrain; // 守恒

    if (actualDrain > 0) {
      events.emit({
        tick,
        type: "entity_drained",
        data: {
          id: entity.id,
          name: entity.name,
          drained: actualDrain,
          qiLeft: qiComp.current,
        },
        message: `「${entity.name}」灵气流失 ${actualDrain}（剩余 ${qiComp.current}）`,
      });
    }

    if (qiComp.current <= 0) {
      entity.alive = false;
      qiComp.current = 0;
      events.emit({
        tick,
        type: "entity_died",
        data: {
          id: entity.id,
          name: entity.name,
          species: entity.species,
          cause: "灵气耗尽",
        },
        message: `💀「${entity.name}」灵气耗尽，化为天地尘埃`,
      });
      died.push(entity);
    }
  }

  return died;
}
