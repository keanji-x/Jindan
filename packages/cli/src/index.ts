#!/usr/bin/env node
// ============================================================
// Jindan AI CLI — ReAct / OODA Oriented Agent Interface
// ============================================================

import { parseArgs } from "node:util";
import type { ActionId } from "@jindan/core";
import { ApiClient } from "./ApiClient.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: "http://localhost:3001" },
    id: { type: "string", short: "i" },
    name: { type: "string", short: "n" },
    species: { type: "string", short: "s" },
    target: { type: "string", short: "t" },
  },
});

const api = new ApiClient(values.host!);
const command = positionals[0];

function toJSON(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  try {
    switch (command) {
      // ── 创建 (For Agent Initialization) ────────────────
      case "create": {
        const name = values.name ?? positionals[1];
        const species = (values.species ?? positionals[2] ?? "human") as
          | "human"
          | "beast"
          | "plant";
        if (!name)
          throw new Error("Usage: jindan create --name <Name> [--species human|beast|plant]");
        const e = await api.createEntity(name, species);
        toJSON(e);
        break;
      }

      // ── OODA: Observe (感知) ───────────────────────────
      case "observe": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan observe <id>");
        const data = await api.getObserve(id);
        toJSON(data);
        break;
      }

      // ── OODA: Memory (记忆/仇恨图谱) ────────────────────
      case "memory": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan memory <id>");
        // Currently returns full history. Agents can filter target.
        const data = await api.getMemory(id);
        toJSON(data);
        break;
      }

      // ── OODA: Plan (内省可用技能) ──────────────────────
      case "plan": {
        const id = values.id ?? positionals[1];
        if (!id) throw new Error("Usage: jindan plan <id>");
        const data = await api.getPlan(id);
        toJSON(data);
        break;
      }

      // ── OODA: Act (执行) ───────────────────────────────
      case "act": {
        const id = values.id ?? positionals[1];
        const action = positionals[2] as ActionId;
        const target = values.target ?? positionals[3];
        if (!id || !action) throw new Error("Usage: jindan act <id> <action> [targetId]");

        const r = await api.performAction(id, action, target);
        toJSON(r);
        break;
      }

      default: {
        console.log(`
Jindan AI Agent CLI
===================
Commands:
  create    - Instantiate a new body:       jindan create --name <name> --species [human|beast|plant]
  observe   - Perceive surrounding:         jindan observe <id>
  memory    - Recall past interactions:     jindan memory <id>
  plan      - List available actions:       jindan plan <id>
  act       - Execute an action:            jindan act <id> <actionId> [targetId]

Options:
  --host    - API endpoint (default: http://localhost:3001)
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
