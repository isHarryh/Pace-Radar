import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { md5Hex } from '@pace-radar/shared';
import { fetchAdminCookie, updateAdminCookie } from '../../api';
import { formatDateTime } from '../../format';
import { badgeBase, badgeTone, btnGhost, btnPrimary, surface, surfaceHeader } from '../ui';

function IdentityLine({ data }: { data: NonNullable<Awaited<ReturnType<typeof fetchAdminCookie>>> }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">未配置凭据</p>;
  }
  if (!data.identity) {
    return <p className="text-sm text-muted">无法识别身份</p>;
  }
  if (data.identity.isLogin) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        <span>已登录</span>
        {data.identity.uname && <span className="font-medium">{data.identity.uname}</span>}
        {data.identity.mid && <span className="text-muted">MID {data.identity.mid}</span>}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-ink">
      <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
      <span>未登录</span>
    </p>
  );
}

function ValidBadge({ valid }: { valid: boolean | null }) {
  if (valid === true) return <span className={`${badgeBase} ${badgeTone.brand}`}>有效</span>;
  if (valid === false) return <span className={`${badgeBase} ${badgeTone.danger}`}>失效</span>;
  return <span className={`${badgeBase} ${badgeTone.muted}`}>未知</span>;
}

export function CookieSection() {
  const queryClient = useQueryClient();
  const [hasFetched, setHasFetched] = useState(false);
  const { data, error: queryError, isFetching, refetch } = useQuery({
    queryKey: ['admin-cookie'],
    queryFn: fetchAdminCookie,
    enabled: false,
    retry: false,
  });

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState('');

  const trimmed = value.trim();
  const draftLength = trimmed.length;
  const draftMd5 = useMemo(() => (trimmed ? md5Hex(trimmed) : null), [trimmed]);
  const needsTrim = value.length !== trimmed.length && value.length > 0;
  const canSave = draftLength >= 50 && !busy;

  const handleFetch = async () => {
    setHasFetched(true);
    const result = await refetch();
    if (result.error) return;
  };

  const save = async () => {
    if (trimmed.length < 50) {
      setSaveError('长度不足，请粘贴包含 SESSDATA 的完整 Cookie');
      return;
    }
    setBusy(true);
    setSaveError('');
    setSaveOk('');
    try {
      await updateAdminCookie(trimmed);
      setValue('');
      setSaveOk('已更新');
      await queryClient.invalidateQueries({ queryKey: ['admin-cookie'] });
      setHasFetched(true);
      await refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={surface}>
      <div className={surfaceHeader}>
        <h2 className="text-sm font-semibold text-ink">B站凭据</h2>
        <p className="mt-1 leading-relaxed text-muted">采集使用的 B 站登录态，更新后即时生效。</p>
      </div>

      <div className="divide-y divide-line/60">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-ink">当前凭据</h3>
            <button
              type="button"
              onClick={handleFetch}
              disabled={isFetching}
              className={isFetching ? btnGhost + ' opacity-60' : btnGhost}
            >
              {isFetching ? '获取中…' : hasFetched ? '刷新' : '获取'}
            </button>
          </div>

          <div className="mt-4">
            {!hasFetched && !isFetching && !queryError && !data && (
              <div className="rounded-lg border border-dashed border-line bg-bg/40 px-4 py-6 text-center">
                <p className="text-sm text-muted">点击获取查看当前凭据的身份与状态</p>
              </div>
            )}

            {isFetching && (
              <div className="space-y-3">
                <div className="h-5 w-32 animate-pulse rounded bg-line" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="h-16 animate-pulse rounded-lg bg-line/60" />
                  <div className="h-16 animate-pulse rounded-lg bg-line/60" />
                  <div className="h-16 animate-pulse rounded-lg bg-line/60" />
                </div>
              </div>
            )}

            {queryError && !isFetching && (
              <div className="rounded-lg bg-danger/10 px-4 py-3">
                <p className="text-sm font-medium text-danger">获取失败</p>
                <p className="mt-1 text-sm text-danger/80">{queryError instanceof Error ? queryError.message : String(queryError)}</p>
                <button type="button" onClick={handleFetch} className={`${btnGhost} mt-3`}>
                  重试
                </button>
              </div>
            )}

            {data && !isFetching && !queryError && (
              <div className="space-y-4">
                {data.length === 0 ? (
                  <div className="rounded-lg bg-bg px-4 py-4">
                    <p className="text-sm text-muted">尚未配置凭据，请在下方粘贴并更新。</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <IdentityLine data={data} />
                      <ValidBadge valid={data.valid} />
                    </div>

                    {data.error && (
                      <div className="rounded-lg bg-danger/10 px-3 py-2.5">
                        <p className="text-sm text-danger">{data.error}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-bg px-3 py-3">
                        <div className="text-sm text-muted">长度</div>
                        <div className="mt-1 font-mono text-sm text-ink">{data.length.toLocaleString()} 字符</div>
                      </div>
                      <div className="rounded-lg bg-bg px-3 py-3 sm:col-span-2">
                        <div className="text-sm text-muted">MD5</div>
                        <div className="mt-1 break-all font-mono text-sm text-ink">{data.md5 ?? '—'}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm text-muted">
                      <span>更新于 {data.updatedAt ? formatDateTime(data.updatedAt) : '未知'}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-bg/30 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-ink">更新凭据</h3>
          <p className="mt-1 text-sm text-muted">粘贴从浏览器复制的完整 Cookie，系统会自动去除前后空白。</p>

          <label className="mt-4 block">
            <span className="sr-only">新 Cookie</span>
            <textarea
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (saveError) setSaveError('');
                if (saveOk) setSaveOk('');
              }}
              rows={4}
              placeholder="SESSDATA=...; bili_jct=...; ..."
              className="min-h-28 w-full resize-y rounded-lg border border-line bg-white px-3 py-3 font-mono text-sm leading-relaxed text-ink outline-none placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">
              长度 <span className="font-mono font-medium text-ink">{draftLength}</span>
            </span>
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
            <span className="break-all text-muted">
              MD5 <span className="font-mono text-ink">{draftMd5 ?? '—'}</span>
            </span>
            {needsTrim && <span className="text-amber-600">已去除前后空白</span>}
          </div>

          {draftLength > 0 && draftLength < 50 && <p className="mt-2 text-sm text-amber-600">长度不足 50，可能不是完整 Cookie</p>}
          {saveError && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{saveError}</p>}
          {saveOk && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveOk}</p>}

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={!value} onClick={() => setValue('')} className={btnGhost}>
              清空
            </button>
            <button type="button" disabled={!canSave} onClick={save} className={btnPrimary}>
              {busy ? '更新中…' : '更新'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
