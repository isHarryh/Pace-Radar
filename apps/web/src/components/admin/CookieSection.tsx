import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAdminCookie, updateAdminCookie } from '../../api';
import { formatClock } from '../../format';
import { StatusCodeBadge } from './LogsSection';

import { btnGhost, btnPrimary, errorMessage, fieldLabel, inputBase, surface, surfaceBody, surfaceFooter, surfaceHeader } from '../ui';

export function CookieSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-cookie'], queryFn: fetchAdminCookie, refetchInterval: 60_000 });
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-cookie'] });
  const canSave = value.trim().length >= 20 && !busy;

  const save = async () => {
    if (value.trim().length < 50) {
      setError('Cookie 长度异常，请粘贴浏览器导出的完整 Cookie（含 SESSDATA）');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateAdminCookie(value.trim());
      setValue('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={surface}>
      <div className={surfaceHeader}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">B站 Cookie</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">用于采集端请求 B 站，需含 SESSDATA 的完整字符串。</p>
          </div>
          {data && (
            <span className="cookie-status">
              {data.masked ? (
                <>
                  <span className="max-w-[16ch] truncate font-mono text-[11px] sm:max-w-[22ch]">{data.masked}…</span>
                  <span className="hidden sm:inline">· {data.length} 字符</span>
                  {data.updatedAt && (
                    <span className="hidden text-muted sm:inline">· 更新于 {formatClock(data.updatedAt)}</span>
                  )}
                  <StatusCodeBadge code={data.valid === null ? 'unknown' : data.valid ? 'ok' : '-101'} />
                </>
              ) : (
                <span className="text-danger">未配置</span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className={surfaceBody}>
        <label className={fieldLabel}>
          <span>粘贴新 Cookie</span>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder="name1=value1; SESSDATA=xxxx; bili_jct=xxxx; ..."
            className={`${inputBase} min-h-24 resize-y py-2.5 font-mono text-xs leading-relaxed`}
          />
        </label>
        {error && <p className={`${errorMessage} mt-3`}>{error}</p>}
        <p className="mt-2 text-xs text-muted">提示：从浏览器开发者工具 → Application → Cookies 复制，或使用 EditThisCookie 导出。</p>
      </div>
      <div className={surfaceFooter}>
        <span className="hidden text-xs text-muted sm:inline">长度需 ≥50 字符，更新后即时生效</span>
        <div className="flex gap-2 self-stretch sm:self-auto">
          <button type="button" disabled={!value} onClick={() => setValue('')} className={btnGhost}>
            清空
          </button>
          <button type="button" disabled={!canSave} onClick={save} className={`${btnPrimary} flex-1 sm:flex-none`}>
            {busy ? '更新中…' : '更新 Cookie'}
          </button>
        </div>
      </div>
    </section>
  );
}
