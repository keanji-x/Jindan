#!/usr/bin/env node
// ============================================================
// Jindan CLI — v2: all action info from ActionRegistry
// ============================================================

import { parseArgs } from "node:util";
import { type ActionDef, type ActionId, ActionRegistry } from "@jindan/core";
import { ApiClient } from "./ApiClient.js";
import {
  formatActionResult,
  formatEntities,
  formatEntity,
  formatLeaderboard,
  formatWorld,
} from "./format.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: "http://localhost:3001" },
    id: { type: "string", short: "i" },
    name: { type: "string", short: "n" },
    species: { type: "string", short: "s" },
    target: { type: "string", short: "t" },
    json: { type: "boolean", default: false },
  },
});

const api = new ApiClient(values.host!);
const command = positionals[0];
const jsonMode = values.json!;

function output(data: unknown, formatter?: (d: never) => string) {
  if (jsonMode || !formatter) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatter(data as never));
  }
}

async function main() {
  try {
    switch (command) {
      // ── 信息查询 ──────────────────────────────────────
      case "world":
      case "status": {
        const world = await api.getWorldStatus();
        output(world, formatWorld);
        break;
      }

      case "info": {
        const id = values.id ?? positionals[1];
        if (!id) throw usageError("info --id <id>", "查看生灵详细信息");
        const e = await api.getEntity(id);
        output(e, formatEntity);
        break;
      }

      case "entities":
      case "list": {
        const entities = await api.getEntities();
        output(entities, formatEntities);
        break;
      }

      case "leaderboard":
      case "rank": {
        const lb = await api.getLeaderboard();
        output(lb, formatLeaderboard);
        break;
      }

      // ── 创建生灵 ──────────────────────────────────────
      case "create": {
        const name = values.name ?? positionals[1];
        const species = (values.species ?? positionals[2] ?? "human") as
          | "human"
          | "beast"
          | "plant";
        if (!name)
          throw usageError("create --name <名字> [--species human|beast|plant]", "创建一个生灵");
        const e = await api.createEntity(name, species);
        output(e, formatEntity);
        const id = (e as Record<string, unknown>).id;
        console.log(`\n💡 记住你的 ID: ${id}`);

        // Show first available action from registry
        const firstAction = ActionRegistry.forSpecies(species).find(
          (a: ActionDef) => a.id !== "rest",
        );
        if (firstAction) {
          console.log(`💡 下一步: jindan ${firstAction.cliCommand} -i ${id}`);
        }
        break;
      }

      // ── 动作: 自动路由 ────────────────────────────────
      default: {
        // Check if command is a known action cliCommand
        const actionDef = ActionRegistry.getAll().find((a: ActionDef) => a.cliCommand === command);
        if (actionDef) {
          const id = values.id ?? positionals[1];
          if (!id)
            throw usageError(
              `${actionDef.cliCommand} --id <id>${actionDef.needsTarget ? " --target <tid>" : ""}`,
              actionDef.description,
            );

          const target = actionDef.needsTarget ? (values.target ?? positionals[2]) : undefined;
          if (actionDef.needsTarget && !target) {
            throw usageError(
              `${actionDef.cliCommand} --id <id> --target <targetId>`,
              actionDef.description,
            );
          }

          const r = await api.performAction(id, actionDef.id, target);
          output(r, formatActionResult);
        } else {
          printHelp();
        }
        break;
      }
    }
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(err.message);
    } else {
      console.error(`❌ ${err instanceof Error ? err.message : err}`);
    }
    process.exit(1);
  }
}

// ── Help (generated from ActionRegistry) ─────────────────

function printHelp() {
  const actions = ActionRegistry.getAll();

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              🏔️  金丹 · 修仙世界 CLI v2  🏔️              ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  📖 信息查询                                              ║
║    world / status           查看天地气象                  ║
║    info -i <id>             查看生灵信息                  ║
║    entities / list          查看所有生灵                  ║
║    leaderboard / rank       排行榜                        ║
║                                                           ║
║  🌟 创建生灵                                              ║
║    create -n <名字> [-s human|beast|plant]                ║
║                                                           ║
║  ⚡ 动作                                                  ║`);

  for (const a of actions) {
    if (a.id === "rest") continue;
    const targetHint = a.needsTarget ? " -t <tid>" : "";
    const species = a.species.join("/");
    const line = `    ${a.cliCommand.padEnd(24)}${a.cliHelp} [${species}]`;
    console.log(`║  ${line.padEnd(56)}║`);
  }

  console.log(`║                                                           ║
║  🔧 全局选项                                              ║
║    --host <url>             API 地址 (默认 :3001)         ║
║    --json                   输出原始 JSON                 ║
║                                                           ║
║  💡 新手指引:                                              ║
║    1. jindan create -n "你的名字" -s human                ║
║    2. jindan meditate -i <id>     → 吸收灵气              ║
║    3. jindan info -i <id>         → 查看状态              ║
║    4. jindan breakthrough -i <id> → 尝试突破!             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

// ── Error Helpers ─────────────────────────────────────────

class UsageError extends Error {}

function usageError(usage: string, description: string): UsageError {
  return new UsageError(
    `❌ 参数不足\n` +
      `   用法: jindan ${usage}\n` +
      `   说明: ${description}\n` +
      `   提示: 加 --json 可获得结构化输出`,
  );
}

main();
