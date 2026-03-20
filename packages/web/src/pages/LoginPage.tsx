import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authLogin } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await authLogin(username.trim(), password);
      login(data.token, data.user.username);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="font-title text-4xl tracking-wider text-gold-glow mb-2">金丹</h1>
          <p className="text-slate-500 text-sm tracking-widest uppercase">修仙世界模拟器</p>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="glass-surface rounded-2xl p-8 space-y-6">
          <h2 className="font-title text-xl text-slate-200 tracking-wide">登录</h2>

          {error && (
            <div className="text-danger text-sm bg-danger/10 rounded-lg px-4 py-2.5 border border-danger/20">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-username"
              className="text-xs text-slate-400 uppercase tracking-wider"
            >
              用户名
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="你的修士代号"
              autoComplete="username"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:border-qi/40 focus:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="text-xs text-slate-400 uppercase tracking-wider"
            >
              密码
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:border-qi/40 focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-body font-bold tracking-wider text-void bg-gradient-to-r from-qi to-qi/80 hover:from-qi/90 hover:to-qi/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "传送中..." : "登录"}
          </button>

          <p className="text-center text-sm text-slate-500">
            没有账号？{" "}
            <Link to="/register" className="text-qi hover:text-qi/80 transition-colors">
              注册
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
