import { useRef, useState } from 'react';
import { updateAdminAvatar } from '../api';
import { Avatar } from './Avatar';
import { btnSmall, btnSmallDanger } from './ui';

/** 将图片文件 cover 裁剪缩放到 64x64 并导出 PNG base64。 */
function fileToSquarePng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error('canvas unavailable'));
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/png').split(',')[1]!);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load image failed'));
    };
    img.src = url;
  });
}

export function AvatarUpload({
  accountId,
  name,
  hasAvatar,
  onSaved,
}: {
  accountId: number;
  name: string;
  hasAvatar: boolean;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cacheBust, setCacheBust] = useState(Date.now());

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await updateAdminAvatar(accountId, await fileToSquarePng(file));
      setCacheBust(Date.now());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Avatar accountId={accountId} name={name} size={28} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className={btnSmall}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '处理中' : '上传'}
      </button>
      {hasAvatar && (
        <button
          type="button"
        className={btnSmallDanger}
        disabled={busy}
          onClick={() => {
            void updateAdminAvatar(accountId, null).then(onSaved);
          }}
        >
          清除
        </button>
      )}
      {error && <span className="max-w-[10ch] truncate text-xs text-danger" title={error}>{error}</span>}
    </div>
  );
}
