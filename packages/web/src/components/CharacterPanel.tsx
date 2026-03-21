import { useState } from "react";
import { Link } from "react-router-dom";
import type { CharacterInfo } from "../api/client";
import { useAuth } from "../context/AuthContext";

const SPECIES = [
  { id: "human", icon: "🧔", label: "人族" },
  { id: "beast", icon: "🐗", label: "妖兽" },
  { id: "plant", icon: "🌿", label: "灵植" },
] as const;

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

interface Props {
  activeCharId: string | null;
  onSelect: (entityId: string, secret: string) => void;
}

export default function CharacterPanel({ activeCharId, onSelect }: Props) {
  const { characters } = useAuth();
  const [error, setError] = useState("");

  // Storage for secrets (in memory + localStorage)
  const [secrets] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    try {
      const stored = JSON.parse(localStorage.getItem("jindan_secrets") || "{}");
      Object.entries(stored).forEach(([k, v]) => map.set(k, v as string));
    } catch {
      /* ignore */
    }
    return map;
  });

  function handleSelectChar(c: CharacterInfo) {
    const secret = secrets.get(c.entityId);
    if (secret) {
      onSelect(c.entityId, secret);
    } else {
      setError(`找不到角色 ${c.name} 的私钥，请重新输入`);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">角色</h2>
        <Link to="/config" className="text-xs text-qi hover:text-qi/80 transition-colors">
          探索大千 ← 向其夺舍
        </Link>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Character list */}
      <div className="space-y-1.5">
        {characters.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8">
            还没有受控角色。
            <br />
            点击右上角去探索并夺舍。
          </p>
        )}
        {characters.map((c) => {
          const isActive = c.entityId === activeCharId;
          const hasSecret = secrets.has(c.entityId);
          return (
            <button
              type="button"
              key={c.entityId}
              onClick={() => handleSelectChar(c)}
              disabled={!hasSecret}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                isActive
                  ? "bg-qi/10 border border-qi/25"
                  : hasSecret
                    ? "hover:bg-white/[0.03] border border-transparent"
                    : "opacity-40 border border-transparent cursor-not-allowed"
              }`}
            >
              <span className="text-xl">
                {SPECIES.find((s) => s.id === c.species)?.icon || "🧔"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-200 truncate">{c.name}</div>
                <div className="text-[10px] text-slate-500">
                  {REALM_NAMES[c.realm || 0] || "凡人"}
                  {!hasSecret && " · 缺少私钥"}
                </div>
              </div>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-qi shadow-[0_0_6px_rgba(56,189,248,0.6)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
