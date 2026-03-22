#!/usr/bin/env node
// ============================================================
// Jindan AI CLI — 修仙世界 Agent 命令行工具
//
// 环境变量（或 .env 文件）:
//   JINDAN_HOST   — API 地址 (默认 http://localhost:3001)
//   JINDAN_SECRET — Agent 认证密钥
// ============================================================

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { ActionId } from "@jindan/core";
import dotenv from "dotenv";
import { ApiClient } from "./ApiClient.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: process.env.JINDAN_HOST || "http://localhost:3001" },
    secret: { type: "string", default: process.env.JINDAN_SECRET },
    id: { type: "string", short: "i" },
    name: { type: "string", short: "n" },
    species: { type: "string", short: "s" },
    target: { type: "string", short: "t" },
    plan: { type: "string", short: "p" },
  },
});

const api = new ApiClient(values.host!, values.secret);
const command = positionals[0];

function toJSON(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  try {
    switch (command) {
      // ── 列表 ──────────────────────────────────────────
      case "ls":
      case "list": {
        const entities = await api.getEntities();
        toJSON(entities);
        break;
      }

      // ── 快照（一站式上下文） ────────────────────────────
      case "snapshot":
      case "snap": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan snapshot <id>");
        const data = await api.getSnapshot(id);
        toJSON(data);
        break;
      }

      // ── 执行（支持单步和多步计划） ────────────────────
      case "act": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan act <id> <action> [target] or --plan '[...]'");

        // 多步计划模式: --plan '[{"action":"meditate"},{"action":"devour","targetId":"xxx"}]'
        if (values.plan) {
          const steps = JSON.parse(values.plan) as Array<{
            action: string;
            targetId?: string;
          }>;
          const results: Array<{ action: string; success: boolean; error?: string }> = [];

          for (const step of steps) {
            const r = await api.performAction(id, step.action as ActionId, step.targetId);
            const success = (r as Record<string, unknown>).success as boolean;
            results.push({
              action: step.action,
              success,
              error: (r as Record<string, unknown>).error as string | undefined,
            });
            if (!success) break; // 失败即停
          }

          toJSON({ plan: steps.length, executed: results.length, results });
          break;
        }

        // 单步模式
        const action = positionals[2] as ActionId;
        const target = values.target ?? positionals[3];
        if (!action) throw new Error("Usage: jindan act <id> <action> [target]");
        const r = await api.performAction(id, action, target);
        toJSON(r);
        break;
      }

      // ── 思考日志 ──────────────────────────────────────
      case "report": {
        const id = values.id ?? positionals[1];
        const text = positionals[2];
        if (!id || !text) throw new Error('Usage: jindan report <id> "<text>"');
        toJSON(await api.postReport(id, text));
        break;
      }

      // ── 生命状态 ──────────────────────────────────────
      case "status": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan status <id>");
        toJSON(await api.getStatus(id));
        break;
      }

      case "tomb": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan tomb <id>");
        toJSON(await api.performTomb(id));
        break;
      }

      case "reincarnate": {
        const id = values.id ?? positionals[1];
        const name = values.name ?? positionals[2];
        const species = (values.species ?? positionals[3] ?? "human") as
          | "human"
          | "beast"
          | "plant";
        if (!id || !name)
          throw new Error(
            "Usage: jindan reincarnate <id> --name <Name> [--species human|beast|plant]",
          );
        toJSON(await api.reincarnate(id, name, species));
        break;
      }

      // ── 世界状态 ──────────────────────────────────────
      case "world": {
        toJSON(await api.getWorldStatus());
        break;
      }

      // ── 排行榜 ────────────────────────────────────────
      case "leaderboard":
      case "lb": {
        toJSON(await api.getLeaderboard());
        break;
      }

      // ── 帮助 ──────────────────────────────────────────
      default: {
        console.log(`
Jindan AI CLI
=============

核心流程 (3 步 OODA):
  ls                                   列出所有实体
  snapshot <id>                        一站式获取完整上下文
  act <id> <action> [target]           执行单个动作
  act <id> --plan '[{...}, ...]'       批量执行计划（串行，失败即停）

生命周期:
  status <id>                          查看生死状态
  tomb <id>                            入葬（lingering → entombed）
  reincarnate <id> --name <n>          转世

查询:
  world                                世界状态
  leaderboard                          排行榜
  report <id> "<text>"                 上报思考日志

环境变量 (或 .env 文件):
  JINDAN_HOST     API 地址 (默认 http://localhost:3001)
  JINDAN_SECRET   Agent 认证密钥
`);
        break;
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

main();
