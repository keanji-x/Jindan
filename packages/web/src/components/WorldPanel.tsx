import { useCallback, useEffect, useRef, useState } from "react";
import {
  type EntityData,
  type GraveyardGroup,
  type GraveyardLife,
  getEntities,
  getGraveyard,
  getWorldStatus,
  type WorldStatus,
} from "../api/client";
import { useAuth } from "../context/AuthContext";

const REALM_NAMES = [
  "凡人",
  "炼气",
  "筑基",
  "金丹",
  "元婴",
  "化神",
  "炼虚",
  "合体",
  "大乘",
  "渡劫",
  "真仙",
];

const SPECIES_ICONS: Record<string, string> = {
  human: "🧔",
  beast: "🐗",
  plant: "🌿",
};

function formatNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.floor(n));
}

/* ── Qi Ring SVG helper ────────────────────────── */
function ringDash(value: number, total: number, radius: number, offset = 0) {
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? value / total : 0;
  const len = circumference * pct;
  return {
    strokeDasharray: `${len} ${circumference}`,
    strokeDashoffset: -offset * circumference,
  };
}

interface Props {
  activeEntityId: string | null;
}

interface LogEntry {
  tick: number;
  msg: string;
  entityId?: string;
}

export default function WorldPanel({ activeEntityId }: Props) {
  const { token } = useAuth();
  const [world, setWorld] = useState<WorldStatus | null>(null);
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [graveyard, setGraveyard] = useState<GraveyardGroup[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logTab, setLogTab] = useState<"global" | "personal">("global");
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial data
  useEffect(() => {
    getWorldStatus()
      .then(setWorld)
      .catch(() => {});
    getEntities()
      .then(setEntities)
      .catch(() => {});
    getGraveyard()
      .then(setGraveyard)
      .catch(() => {});
  }, []);

  // Poll graveyard every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      getGraveyard()
        .then(setGraveyard)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket for live updates (requires JWT token)
  useEffect(() => {
    if (!token) return; // not logged in, skip WS
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          message?: string;
          tick?: number;
          data?: { entities?: EntityData[]; entity?: { id?: string } };
        };
        if (data.type === "world_snapshot" || data.type === "tick_complete") {
          if (data.data?.entities) setEntities(data.data.entities);
          setWorld((prev) => ({ ...prev, ...data.data }) as WorldStatus);
        } else if (data.type && data.message) {
          // Event log messages
          setLogs((prev) => {
            const next = [
              ...prev,
              {
                tick: data.tick ?? 0,
                msg: data.message!,
                entityId: data.data?.entity?.id,
              },
            ];
            return next.slice(-200);
          });
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      setTimeout(() => {}, 3000);
    };

    return () => ws.close();
  }, [token]);

  // ── Extract world data (matching original web logic) ────
  const tick = world?.tick ?? 0;
  const ambientPool = world?.ambientPool;
  const ambientQi = ambientPool?.pools?.ql ?? 0;
  const shaQi = Math.abs(ambientPool?.pools?.qs ?? 0);

  // Entity Qi = sum of all alive entities' core particle tanks
  let entityQi = 0;
  for (const e of entities) {
    if (e.status === "alive" && e.components) {
      if (e.components.tank?.coreParticle && e.components.tank.tanks) {
        entityQi += e.components.tank.tanks[e.components.tank.coreParticle] || 0;
      } else if (e.components.cultivation) {
        entityQi += e.components.cultivation.currentQi || 0;
      }
    }
  }

  const lingQi = ambientQi + entityQi; // 天地正气 = 游离灵气 + 众生之气
  const totalOuter = ambientQi + entityQi || 1; // outer ring total
  const totalInner = lingQi + shaQi || 1; // inner ring total
  const popTotal = entities.filter((e) => e.status === "alive").length;

  // Sort entities by power
  const sorted = [...entities]
    .filter((e) => e.status === "alive")
    .sort((a, b) => (b.components?.combat?.power ?? 0) - (a.components?.combat?.power ?? 0));

  // Focus entity
  const focusEntity = activeEntityId
    ? (entities.find((e) => e.id === activeEntityId) ?? null)
    : null;
  const coreParticle = focusEntity?.components?.tank?.coreParticle ?? "ql";
  const focusQi = focusEntity?.components?.tank?.tanks?.[coreParticle] ?? 0;
  const focusMaxQi = focusEntity?.components?.tank?.maxTanks?.[coreParticle] ?? 1;
  const focusQiPct = focusMaxQi > 0 ? Math.round((focusQi / focusMaxQi) * 100) : 0;
  const focusPower = focusEntity?.components?.combat?.power ?? 0;
  const focusRealm = focusEntity?.components?.cultivation?.realm ?? 0;

  // Filter logs for personal tab
  const personalLogs = logs.filter((l) => l.entityId === activeEntityId);
  const displayLogs = logTab === "global" ? logs : personalLogs;

  // Connection status
  const [connected, setConnected] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tracks wsRef.current deliberately
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    if (ws.readyState === WebSocket.OPEN) setConnected(true);
    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("close", onClose);
    };
  }, [wsRef.current]);

  // Log auto-scroll
  const logEndRef = useRef<HTMLDivElement>(null);
  const scrollLogs = useCallback(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to scroll when log count changes
  useEffect(() => {
    scrollLogs();
  }, [displayLogs.length, scrollLogs]);

  const outerR = 55,
    innerR = 38;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* ═══════ Header ═══════ */}
      <div className="flex items-center justify-between">
        <h1
          className="font-title text-2xl font-bold tracking-wider"
          style={{
            background: "linear-gradient(to right, #fbbf24, #f59e0b, #d97706)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          金丹 · 修仙录
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-full border border-white/[0.08]">
            <span className="text-xs text-slate-400 uppercase tracking-wider">纪日</span>
            <span className="font-title text-lg font-bold text-gold text-gold-glow">{tick}</span>
          </div>
          <div
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
              connected
                ? "text-success border-success/30 bg-success/5"
                : "text-danger border-danger/30 bg-danger/5"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-success shadow-[0_0_8px_#10b981]" : "bg-danger shadow-[0_0_8px_#f43f5e] animate-pulse"}`}
            />
            <span>{connected ? "灵网已通" : "灵网断接"}</span>
          </div>
        </div>
      </div>

      {/* ═══════ TOP: Qi Pool + Leaderboard ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Qi Pool Panel */}
        <div className="glass-panel">
          <h2 className="section-title">天地大千源气</h2>
          <div className="flex items-center justify-around flex-1 py-2">
            {/* Left Legend */}
            <div className="flex flex-col gap-4 text-right text-sm text-slate-400">
              <div className="leading-tight">
                <span className="inline-block w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_5px_#38bdf8] mr-1.5 align-middle" />
                游离灵气
                <br />
                <strong className="font-title text-lg text-slate-100">
                  {formatNum(ambientQi)}
                </strong>
              </div>
              <div className="leading-tight">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_5px_#fbbf24] mr-1.5 align-middle" />
                众生之气
                <br />
                <strong className="font-title text-lg text-slate-100">{formatNum(entityQi)}</strong>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                生灵总数: <b className="text-slate-200">{popTotal}</b>
              </div>
            </div>

            {/* Concentric Rings */}
            <div className="relative w-[140px] h-[140px] flex-shrink-0">
              <svg viewBox="0 0 140 140" className="w-full h-full overflow-visible">
                <title>双极灵池光环</title>
                {/* Outer Ring */}
                <circle className="ring-bg" cx="70" cy="70" r={outerR} />
                <circle
                  cx="70"
                  cy="70"
                  r={outerR}
                  className="ring-fill"
                  style={{
                    stroke: "#38bdf8",
                    filter: "drop-shadow(0 0 5px rgba(56,189,248,0.4))",
                    ...ringDash(ambientQi, totalOuter, outerR),
                  }}
                  transform="rotate(-90 70 70)"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={outerR}
                  className="ring-fill"
                  style={{
                    stroke: "#fbbf24",
                    filter: "drop-shadow(0 0 5px rgba(251,191,36,0.4))",
                    ...ringDash(entityQi, totalOuter, outerR, ambientQi / totalOuter),
                  }}
                  transform="rotate(-90 70 70)"
                />
                {/* Inner Ring */}
                <circle className="ring-bg" cx="70" cy="70" r={innerR} />
                <circle
                  cx="70"
                  cy="70"
                  r={innerR}
                  className="ring-fill"
                  style={{
                    stroke: "#34d399",
                    filter: "drop-shadow(0 0 5px rgba(52,211,153,0.4))",
                    ...ringDash(lingQi, totalInner, innerR),
                  }}
                  transform="rotate(-90 70 70)"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={innerR}
                  className="ring-fill"
                  style={{
                    stroke: "#f43f5e",
                    filter: "drop-shadow(0 0 5px rgba(244,63,94,0.4))",
                    ...ringDash(shaQi, totalInner, innerR, lingQi / totalInner),
                  }}
                  transform="rotate(-90 70 70)"
                />
              </svg>
              {/* Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[0.65rem] text-slate-400 tracking-wider">宇宙总气</div>
                <div
                  className="font-title text-xl font-bold text-white"
                  style={{ textShadow: "0 0 10px rgba(255,255,255,0.5)" }}
                >
                  {formatNum(ambientQi + entityQi)}
                </div>
              </div>
            </div>

            {/* Right Legend */}
            <div className="flex flex-col gap-4 text-left text-sm text-slate-400">
              <div className="leading-tight">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399] mr-1.5 align-middle" />
                天地正气
                <br />
                <strong className="font-title text-lg text-slate-100">{formatNum(lingQi)}</strong>
              </div>
              <div className="leading-tight">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_5px_#f43f5e] mr-1.5 align-middle" />
                天地煞气
                <br />
                <strong className="font-title text-lg text-slate-100">{formatNum(shaQi)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard Panel */}
        <div className="glass-panel">
          <h2 className="section-title">天骄榜 (Top Cultivators)</h2>
          <div className="grid grid-cols-[2fr_1.5fr_1fr] px-3 pb-2 text-[0.7rem] text-slate-500 uppercase tracking-wider">
            <span>修仙者</span>
            <span>境界</span>
            <span className="text-right">战力</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px]">
            {sorted.slice(0, 15).map((e, i) => {
              const isMe = e.id === activeEntityId;
              const realm = e.components?.cultivation?.realm ?? 0;
              const power = e.components?.combat?.power ?? 0;
              const species = e.species || "human";
              return (
                <div
                  key={e.id}
                  className={`w-full grid grid-cols-[2fr_1.5fr_1fr] items-center px-3 py-2 rounded-lg transition-all text-left ${
                    isMe
                      ? "bg-qi/[0.08] border border-qi/20 shadow-[inset_2px_0_0_#38bdf8]"
                      : "bg-white/[0.02] border border-white/[0.05] hover:bg-sky-500/[0.08] hover:border-sky-500/20 hover:translate-x-1"
                  }`}
                >
                  <span className="flex items-center gap-2 font-bold text-slate-200 text-sm">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[0.65rem] font-mono ${
                        i === 0
                          ? "bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          : i === 1
                            ? "bg-gradient-to-br from-slate-400 to-slate-600 text-white"
                            : i === 2
                              ? "bg-gradient-to-br from-amber-700 to-amber-900 text-white"
                              : "bg-white/10"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span>{SPECIES_ICONS[species] || "🧔"}</span>
                    <span className={`truncate ${isMe ? "text-qi font-bold" : ""}`}>{e.name}</span>
                  </span>
                  <span className="text-qi text-xs">{REALM_NAMES[realm]}</span>
                  <span className="text-right text-combat font-title font-bold text-sm">
                    {formatNum(power)}
                  </span>
                </div>
              );
            })}
            {entities.length === 0 && (
              <div className="text-center text-slate-500 italic py-8 text-sm">
                天地初开，暂无天骄
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ GRAVEYARD ═══════ */}
      {graveyard.length > 0 && (
        <div className="glass-panel">
          <h2 className="section-title">🪦 坟墓区 · Graveyard</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
            {graveyard.map((group, i) => {
              const lives = group.lives || [group as GraveyardLife];
              const latest = lives[lives.length - 1] || lives[0];
              const lifeCount = lives.length;
              const statusBadge = latest.status === "lingering" ? "👻 游魂" : "🪦 安息";
              return (
                <div key={group.soulId || `grave-${i}`} className="tomb-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{SPECIES_ICONS[latest.species ?? ""] || "🪦"}</span>
                      <div>
                        <div className="text-sm font-bold text-slate-200">
                          {latest.name || "无名氏"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {latest.species}
                          {lifeCount > 1 ? ` · 第${lifeCount}世` : ""}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        latest.status === "lingering"
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                      }`}
                    >
                      {statusBadge}
                    </span>
                  </div>
                  {latest.epitaph && (
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-line">
                      {latest.epitaph}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ BOTTOM: Focus + Logs ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4 lg:gap-6">
        {/* Entity Focus Panel */}
        <div
          className="glass-panel"
          style={{ background: "linear-gradient(180deg, rgba(13,17,30,0.65), rgba(13,17,30,0.9))" }}
        >
          <h2 className="section-title" id="focus-title">
            内观: {focusEntity ? focusEntity.name : "未指定"}
          </h2>
          {focusEntity ? (
            <div className="flex flex-col items-center gap-4">
              {/* Jindan Sphere */}
              <div className="liquid-sphere">
                <div className="liquid" style={{ height: `${focusQiPct}%` }} />
                <div className="sphere-glare" />
              </div>
              <div className="text-center">
                <div className="text-[0.7rem] text-slate-400 uppercase tracking-widest mb-0.5">
                  灵力容纳 (Qi)
                </div>
                <div
                  className="font-title text-lg text-white"
                  style={{ textShadow: "0 0 15px rgba(56,189,248,0.5)" }}
                >
                  {formatNum(focusQi)} <span className="text-slate-500 text-sm">/</span>{" "}
                  {formatNum(focusMaxQi)}
                </div>
                <div className="text-sm text-qi mt-0.5">{focusQiPct}%</div>
              </div>

              {/* Details */}
              <div className="w-full bg-black/20 rounded-xl p-3 border border-white/[0.03] space-y-2">
                <div className="flex justify-between items-center text-sm py-1 border-b border-dashed border-white/[0.05]">
                  <span className="text-slate-400">战力</span>
                  <span className="font-bold text-combat">{formatNum(focusPower)}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1">
                  <span className="text-slate-400">境界</span>
                  <span className="font-bold text-slate-200">{REALM_NAMES[focusRealm]}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-500 italic">
                点击天骄榜中一位修仙者，以内观其金丹。
              </p>
            </div>
          )}
        </div>

        {/* Event Logs Panel */}
        <div className="glass-panel !p-0">
          <div className="flex border-b border-white/[0.08] bg-black/20">
            <button
              type="button"
              onClick={() => setLogTab("global")}
              className={`flex-1 py-3 px-4 text-sm font-body cursor-pointer transition-all relative ${
                logTab === "global"
                  ? "text-qi font-bold"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              天地异象录
              {logTab === "global" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-qi shadow-[0_-2px_10px_rgba(56,189,248,0.5)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setLogTab("personal")}
              className={`flex-1 py-3 px-4 text-sm font-body cursor-pointer transition-all relative ${
                logTab === "personal"
                  ? "text-qi font-bold"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              个人仙缘
              {logTab === "personal" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-qi shadow-[0_-2px_10px_rgba(56,189,248,0.5)]" />
              )}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-[350px] min-h-[200px]">
            {displayLogs.length > 0 ? (
              displayLogs.slice(-100).map((log) => (
                <div key={`log-${log.tick}-${log.msg.slice(0, 20)}`} className="log-entry">
                  <span className="text-[0.7rem] text-slate-600 font-mono mr-2">[{log.tick}]</span>
                  {log.msg}
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-500 italic py-8">
                {logTab === "personal"
                  ? "请先在天骄榜点击一名修仙者，以探寻其仙缘轨迹。"
                  : "等待天地异象..."}
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
