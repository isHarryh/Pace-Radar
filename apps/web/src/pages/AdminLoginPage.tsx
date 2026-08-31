import { useState } from 'react';
import { fetchAdminAccounts, setAdminToken, clearAdminToken } from '../api';
import { Header } from '../components/Header';

export function AdminLoginPage() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!token.trim()) {
      setError('请输入访问令牌');
      return;
    }
    setBusy(true);
    setError('');
    setAdminToken(token.trim());
    try {
      await fetchAdminAccounts();
      window.location.hash = '#/admin';
    } catch (err) {
      clearAdminToken();
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header back />
      <main className="mx-auto max-w-sm px-3 py-8 sm:px-4 sm:py-12">
        <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <div className="border-b border-line/60 bg-bg/40 px-5 py-4">
            <h1 className="text-sm font-semibold text-ink">管理后台登录</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">受保护区域，需访问令牌。令牌由 `app_config.admin_token` 配置。</p>
          </div>
          <div className="p-5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              <span>访问令牌</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
                placeholder="输入 admin_token"
                className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/60 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                autoComplete="current-password"
              />
            </label>
            {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          </div>
          <div className="border-t border-line/60 bg-bg/30 px-5 py-3">
            <button
              type="button"
              disabled={busy || !token.trim()}
              onClick={submit}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '验证中…' : '进入管理后台'}
            </button>
          </div>
        </section>
        <p className="mt-4 text-center text-xs text-muted">
          令牌错误？请检查 D1 中 <span className="font-mono text-ink">admin_token</span> 或联系管理员。
        </p>
      </main>
    </>
  );
}