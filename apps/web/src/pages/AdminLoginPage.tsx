import { useState } from 'react';
import { fetchAdminAccounts, setAdminToken, clearAdminToken } from '../api';
import { Header } from '../components/Header';
import { btnPrimary, errorMessage, fieldLabel, inputBase, pageShellNarrow, surface, surfaceBody, surfaceFooter, surfaceHeader } from '../components/ui';

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
      <main className={pageShellNarrow}>
        <section className={surface}>
          <div className={`${surfaceHeader} px-5 py-4`}>
            <h1 className="text-sm font-semibold text-ink">管理后台登录</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">受保护区域，需访问令牌。令牌由 `app_config.admin_token` 配置。</p>
          </div>
          <div className={`${surfaceBody} p-5`}>
            <label className={fieldLabel}>
              <span>访问令牌</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
                placeholder="输入 admin_token"
                className={inputBase}
                autoComplete="current-password"
              />
            </label>
            {error && <p className={`${errorMessage} mt-3`}>{error}</p>}
          </div>
          <div className={`${surfaceFooter} px-5 py-3`}>
            <button
              type="button"
              disabled={busy || !token.trim()}
              onClick={submit}
              className={`${btnPrimary} w-full`}
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
