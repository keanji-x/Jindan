import { useState } from "react";
import { type CharacterInfo, charCreate } from "../api/client";
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
  const { token, characters, addCharacter } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("human");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

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

  function saveSecret(entityId: string, secret: string) {
    secrets.set(entityId, secret);
    const obj: Record<string, string> = {};
    secrets.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem("jindan_secrets", JSON.stringify(obj));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setError("");
    setLoading(true);
    try {
      const data = await charCreate(token!, name.trim(), species);
      saveSecret(data.entityId, data.secret);
      setNewSecret(data.secret);
      addCharacter({
        entityId: data.entityId,
        name: name.trim(),
        species,
      });
      setName("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
    setLoading(false);
  }

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
        <button
          type="button"
          onClick={() => setCreating(!creating)}
          className="text-xs text-qi hover:text-qi/80 transition-colors"
        >
          {creating ? "取消" : "+ 新角色"}
        </button>
      </div>

      {/* Secret display (after creation) */}
      {newSecret && (
        <div className="bg-qi/5 border border-qi/20 rounded-xl p-4 space-y-2 animate-slide-up">
          <div className="text-xs text-qi font-bold">🔑 私钥已生成</div>
          <code className="block text-xs font-mono text-qi break-all select-all bg-black/30 rounded-lg p-2">
            {newSecret}
          </code>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            保存此私钥！用于网站登录对话和 Agent 附着。
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(newSecret);
              setNewSecret(null);
            }}
            className="w-full text-xs py-1.5 rounded-lg bg-qi/10 text-qi hover:bg-qi/20 transition-colors"
          >
            📋 复制并关闭
          </button>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="glass-surface rounded-xl p-4 space-y-3 animate-slide-up">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="法号"
            maxLength={20}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-qi/40 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div className="flex gap-1.5">
            {SPECIES.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setSpecies(s.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs transition-all ${
                  species === s.id
                    ? "bg-qi/10 border border-qi/30 text-qi"
                    : "bg-white/[0.02] border border-white/[0.06] text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="text-base">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full py-2 rounded-lg text-sm font-bold text-void bg-qi hover:bg-qi/90 disabled:opacity-40 transition-all"
          >
            {loading ? "创建中..." : "创建角色"}
          </button>
        </div>
      )}

      {/* Character list */}
      <div className="space-y-1.5">
        {characters.length === 0 && !creating && (
          <p className="text-xs text-slate-600 text-center py-8">
            还没有角色。点击「+ 新角色」开始修仙之旅。
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
