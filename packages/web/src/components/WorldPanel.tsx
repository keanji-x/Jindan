import { useEffect, useState } from "react";
import {
  type ChronicleEntry,
  type EntityData,
  type GraveyardGroup,
  type GraveyardLife,
  getChronicle,
  getEntities,
  getGraveyard,
  getRelations,
  getWorldStatus,
  type RelationEdge,
  type WorldStatus,
} from "../api/client";
import RelationGraph from "./RelationGraph";

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

export default function WorldPanel({ activeEntityId }: Props) {
  const [world, setWorld] = useState<WorldStatus | null>(null);
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [relations, setRelations] = useState<Record<string, RelationEdge>>({});
  const [graveyard, setGraveyard] = useState<GraveyardGroup[]>([]);
  const [chronicle, setChronicle] = useState<ChronicleEntry[]>([]);
  const [expandedTick, setExpandedTick] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");

  // ── Polling: fetch everything every 3 seconds ──────────
  useEffect(() => {
    const fetchAll = () => {
      getWorldStatus()
        .then(setWorld)
        .catch(() => {});
      getEntities()
        .then(setEntities)
        .catch(() => {});
      getRelations()
        .then(setRelations)
        .catch(() => {});
      getGraveyard()
        .then(setGraveyard)
        .catch(() => {});
      getChronicle()
        .then(setChronicle)
        .catch(() => {});
    };
    fetchAll(); // initial
    const timer = setInterval(fetchAll, 3000);
    return () => clearInterval(timer);
  }, []);

  // ── Extract world data ─────────────────────────────────
  const tick = world?.tick ?? 0;
  const daoTanks = world?.daoTanks;
  const ambientQi = daoTanks?.ql ?? 0;
  const shaQi = Math.abs(daoTanks?.qs ?? 0);

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

  const lingQi = ambientQi + entityQi;
  const totalOuter = ambientQi + entityQi || 1;
  const totalInner = lingQi + shaQi || 1;
  const popTotal = entities.filter((e) => e.status === "alive").length;

  const sorted = [...entities]
    .filter((e) => e.status === "alive" || e.status === "lingering")
    .sort(
      (a, b) => (b.components?.cultivation?.realm ?? 0) - (a.components?.cultivation?.realm ?? 0),
    );

  // Focus entity
  const focusEntity = activeEntityId
    ? (entities.find((e) => e.id === activeEntityId) ?? null)
    : null;
  const coreParticle = focusEntity?.components?.tank?.coreParticle ?? "ql";
  const focusQi = focusEntity?.components?.tank?.tanks?.[coreParticle] ?? 0;
  const focusRealm0 = focusEntity?.components?.cultivation?.realm ?? 0;
  const focusQiPct = Math.min(100, Math.max(5, (focusRealm0 + 1) * 10));
  const focusRealm = focusEntity?.components?.cultivation?.realm ?? 0;

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
        </div>
      </div>

      {/* ═══════ TOP: Qi Pool + 生灵榜/关系图 ═══════ */}
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

        {/* 生灵榜 / 关系图 — toggle */}
        <div className="glass-panel">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title !mb-0">{viewMode === "list" ? "生灵榜" : "因缘图谱"}</h2>
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === "list" ? "graph" : "list"))}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/[0.1] text-slate-400 hover:text-qi hover:border-qi/40 transition-all bg-white/[0.02] hover:bg-qi/[0.05]"
            >
              {viewMode === "list" ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>切换到因缘图谱</title>
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
                    <line x1="8.5" y1="6" x2="15" y2="6" />
                  </svg>
                  因缘图谱
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>切换到生灵榜</title>
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <circle cx="4" cy="6" r="1" />
                    <circle cx="4" cy="12" r="1" />
                    <circle cx="4" cy="18" r="1" />
                  </svg>
                  生灵榜
                </>
              )}
            </button>
          </div>

          {viewMode === "list" ? (
            <>
              <div className="grid grid-cols-[2fr_1fr] px-3 pb-2 text-[0.7rem] text-slate-500 uppercase tracking-wider">
                <span>修仙者</span>
                <span className="text-right">境界</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px]">
                {sorted.slice(0, 15).map((e, i) => {
                  const isMe = e.id === activeEntityId;
                  const realm = e.components?.cultivation?.realm ?? 0;
                  const species = e.species || "human";
                  const isGhost = e.status === "lingering";
                  return (
                    <div
                      key={e.id}
                      className={`w-full grid grid-cols-[2fr_1fr] items-center px-3 py-2 rounded-lg transition-all text-left ${
                        isMe
                          ? "bg-qi/[0.08] border border-qi/20 shadow-[inset_2px_0_0_#38bdf8]"
                          : isGhost
                            ? "bg-purple-500/[0.04] border border-purple-500/10 opacity-70"
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
                        <span>{isGhost ? "👻" : SPECIES_ICONS[species] || "🧔"}</span>
                        <span
                          className={`truncate ${isMe ? "text-qi font-bold" : isGhost ? "text-purple-300" : ""}`}
                        >
                          {e.name}
                        </span>
                      </span>
                      <span
                        className={`text-xs text-right ${isGhost ? "text-purple-400" : "text-qi"}`}
                      >
                        {isGhost ? "游魂" : REALM_NAMES[realm]}
                      </span>
                    </div>
                  );
                })}
                {entities.length === 0 && (
                  <div className="text-center text-slate-500 italic py-8 text-sm">
                    天地初开，暂无生灵
                  </div>
                )}
              </div>
            </>
          ) : (
            <RelationGraph
              entities={entities}
              relations={relations}
              activeEntityId={activeEntityId}
            />
          )}
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

      {/* ═══════ BOTTOM: Focus + Chronicle ═══════ */}
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
              <div className="liquid-sphere">
                <div className="liquid" style={{ height: `${focusQiPct}%` }} />
                <div className="sphere-glare" />
              </div>
              <div className="text-center">
                <div className="text-[0.7rem] text-slate-400 uppercase tracking-widest mb-0.5">
                  灵力 (Qi)
                </div>
                <div
                  className="font-title text-2xl text-white"
                  style={{ textShadow: "0 0 15px rgba(56,189,248,0.5)" }}
                >
                  {formatNum(focusQi)}
                </div>
              </div>
              <div className="w-full bg-black/20 rounded-xl p-3 border border-white/[0.03] space-y-2">
                <div className="flex justify-between items-center text-sm py-1">
                  <span className="text-slate-400">境界</span>
                  <span className="font-bold text-slate-200">{REALM_NAMES[focusRealm]}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-500 italic">
                点击生灵榜中一位修仙者，以内观其金丹。
              </p>
            </div>
          )}
        </div>

        {/* ═══════ Chronicle Timeline ═══════ */}
        <div className="glass-panel !p-0">
          <div className="border-b border-white/[0.08] bg-black/20 px-4 py-3">
            <h2 className="section-title !mb-0">📜 编年史 · Chronicle</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[350px] min-h-[200px]">
            {chronicle.length > 0 ? (
              [...chronicle].reverse().map((entry) => {
                const isExpanded = expandedTick === entry.tick;
                // Intensity color: low=slate, mid=amber, high=rose
                const intensityColor =
                  entry.intensity >= 0.6
                    ? "border-rose-500/30 bg-rose-500/[0.04]"
                    : entry.intensity >= 0.3
                      ? "border-amber-500/30 bg-amber-500/[0.04]"
                      : "border-white/[0.08] bg-white/[0.02]";
                const intensityDot =
                  entry.intensity >= 0.6
                    ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]"
                    : entry.intensity >= 0.3
                      ? "bg-amber-400 shadow-[0_0_6px_#fbbf24]"
                      : "bg-slate-500";

                return (
                  <button
                    type="button"
                    key={`chr-${entry.tick}`}
                    onClick={() => setExpandedTick(isExpanded ? null : entry.tick)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer hover:translate-x-0.5 ${intensityColor}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${intensityDot}`} />
                      <span className="text-[0.7rem] text-slate-500 font-mono">[{entry.tick}]</span>
                      <span className="text-sm text-slate-200 font-bold truncate">
                        {entry.headline}
                      </span>
                    </div>
                    {isExpanded && entry.body && (
                      <div className="mt-2 ml-4 text-xs text-slate-400 leading-relaxed whitespace-pre-line border-l-2 border-white/[0.06] pl-3">
                        {entry.body}
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-500 italic py-8">
                天地初开，尚无记载...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
