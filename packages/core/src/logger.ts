import { join } from "node:path";
import { fileURLToPath } from "node:url";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type { World } from "./world/World.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const logDir = join(__dirname, "../../../logs");

// 修仙专属文本排版格式 (Jindan Format)
const jindanFormat = winston.format.printf((info) => {
  const { timestamp, level, message, tick, type } = info as {
    timestamp: string;
    level: string;
    message: string;
    tick?: number;
    type?: string;
  };
  const tickStr = tick !== undefined ? `Tick ${String(tick).padStart(4, "0")}` : "System   ";
  const typeStr = type ? String(type).padEnd(20, " ") : level.padEnd(20, " ");
  return `[${timestamp as string}] ${tickStr} | ${typeStr} | ${message}`;
});

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), jindanFormat),
  transports: [
    // 每日日志轮转策略
    new DailyRotateFile({
      dirname: logDir,
      filename: "world-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true, // 归档压缩旧日志
      maxSize: "20m", // 单文件最大 20MB
      maxFiles: "14d", // 保留 14 天防止磁盘打满
    }),
  ],
});

export function attachFileLogger(world: World) {
  world.events.onAny((e) => {
    logger.info(e.message ?? "", { tick: e.tick, type: e.type });
  });
}
