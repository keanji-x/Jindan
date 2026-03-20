import { useState } from "react";
import { Link } from "react-router-dom";
import { charCreate, charDelete } from "../api/client";
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

export default function EntityConfigPage() {
  const { token, characters, addCharacter, removeCharacter } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("human");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setError("");
    setLoading(true);
    try {
      const data = await charCreate(token!, name.trim(), species);
      setNewSecret(data.secret);
      addCharacter({
        entityId: data.entityId,
        name: name.trim(),
        species,
      });
      setName("");
      setCreating(false);
      // save to local storage
      const stored = JSON.parse(localStorage.getItem("jindan_secrets") || "{}");
      stored[data.entityId] = data.secret;
      localStorage.setItem("jindan_secrets", JSON.stringify(stored));
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
    setLoading(false);
  }

  async function handleDelete(entityId: string, charName: string) {
    if (
      !confirm(`确认要删除实体「${charName}」吗？删除后该实体及所有相关数据将彻底消失且无法找回。`)
    )
      return;
    try {
      await charDelete(token!, entityId);
      removeCharacter(entityId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="min-h-screen bg-void text-slate-300 p-8 flex flex-col items-center overflow-y-auto">
      <div className="w-full max-w-4xl space-y-6 animate-fade-in">
        <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-xl border border-white/[0.05]">
          <h1 className="text-xl font-bold text-qi">实体配置管理</h1>
          <Link
            to="/"
            className="text-sm border border-qi/30 text-qi px-4 py-2 rounded-lg hover:bg-qi/10 transition-colors"
          >
            返回控制台
          </Link>
        </div>

        {/* Creation Result Alert */}
        {newSecret && (
          <div className="bg-qi/10 border border-qi/40 rounded-xl p-5 space-y-3 animate-slide-up">
            <div className="text-sm text-qi font-bold">🔑 私钥已生成（仅显示一次）</div>
            <code className="block text-sm font-mono text-qi break-all select-all bg-black/40 rounded-lg p-3 border border-qi/20">
              {newSecret}
            </code>
            <p className="text-xs text-slate-400">
              请妥善保存此私钥，它用于客户端和 Agent 的独立登录。此后该私钥将不再显示。
            </p>
            <button
              type="button"
              onClick={() => setNewSecret(null)}
              className="mt-2 text-xs px-4 py-2 rounded-lg bg-qi/20 text-qi hover:bg-qi/30 transition-colors"
            >
              已复制并保存，关闭
            </button>
          </div>
        )}

        {/* Create Character Section */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-6 space-y-4 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
            <h2 className="text-lg font-bold text-slate-200">创建新实体</h2>
            <button
              type="button"
              onClick={() => setCreating(!creating)}
              className="text-sm bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 px-4 py-1.5 rounded-lg transition-colors"
            >
              {creating ? "取消" : "+ 添加实体"}
            </button>
          </div>

          {creating && (
            <div className="space-y-4 animate-slide-up pt-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="实体名称 (最多20个字符)"
                maxLength={20}
                className="w-full bg-black/40 border border-white/[0.1] rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:border-qi focus:outline-none focus:ring-1 focus:ring-qi/50 transition-all"
              />
              <div className="flex gap-3">
                {SPECIES.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSpecies(s.id)}
                    className={`flex-1 overflow-hidden flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border transition-all ${
                      species === s.id
                        ? "bg-qi/10 border-qi/50 text-qi shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                        : "bg-black/20 border-white/[0.05] text-slate-500 hover:text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-2xl mb-1">{s.icon}</span>
                    <span className="text-sm font-medium">{s.label}</span>
                  </button>
                ))}
              </div>
              {error && (
                <p className="text-sm text-danger bg-danger/10 p-3 rounded-lg border border-danger/20">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="w-full py-3 mt-2 rounded-lg text-sm font-bold text-void bg-qi hover:bg-qi/90 hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] disabled:opacity-40 disabled:hover:shadow-none transition-all"
              >
                {loading ? "创建中..." : "确认创建"}
              </button>
            </div>
          )}
        </div>

        {/* Existing Characters List */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden shadow-lg shadow-black/20">
          <div className="p-6 border-b border-white/[0.05]">
            <h2 className="text-lg font-bold text-slate-200">现有实体列表</h2>
            <p className="text-xs text-slate-500 mt-1">
              这里列出了你当前拥有的所有实体。你可以在此查看它们的 Entity ID，或者永久删除它们。
            </p>
          </div>

          {characters.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">暂无实体记录。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500 bg-white/[0.01]">
                  <tr>
                    <th className="px-6 py-4 font-normal">物种</th>
                    <th className="px-6 py-4 font-normal">名称</th>
                    <th className="px-6 py-4 font-normal">境界</th>
                    <th className="px-6 py-4 font-normal w-1/3">Entity ID</th>
                    <th className="px-6 py-4 font-normal text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {characters.map((c) => (
                    <tr key={c.entityId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg mr-2">
                          {SPECIES.find((s) => s.id === c.species)?.icon}
                        </span>
                        <span className="text-slate-300">
                          {SPECIES.find((s) => s.id === c.species)?.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-200">
                        {c.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                        {REALM_NAMES[c.realm || 0] || "凡人"}
                      </td>
                      <td className="px-6 py-4 font-mono text-qi/80 text-xs tracking-wider">
                        {c.entityId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(c.entityId, c.name)}
                          className="px-3 py-1.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 transition-colors text-xs"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
